import { fileTypeFromBuffer } from 'file-type'
import { canonicalExtension, isKnownType, octetStream, textTypes, typeOfExtension } from './media-types'

/** How many first bytes the type is detected from. */
export const detectBytes = 4100

export type DecideInput = {
  /** The first bytes of the content (at least `detectBytes` of it, unless the file is shorter). */
  head: Uint8Array
  /** The whole content when it is no longer than `head`; text checks then also see its last character. */
  complete: boolean
  /** The uploader's file name, for its extension. */
  name?: string
  /** The type the client declared: the request's or the file part's Content-Type. */
  declared?: string
  /** The field's allowed types. */
  accept: readonly string[]
}

export type TypeDecision = { type: string; extension: string; corrected?: { from: string; to: string } }

const isText = (head: Uint8Array, complete: boolean) => {
  if (head.includes(0)) return false
  try {
    // A cut multibyte character at the end of an incomplete head is not an error.
    new TextDecoder('utf-8', { fatal: true }).decode(head, { stream: !complete })
    return true
  } catch (error) {
    if (error instanceof TypeError) return false
    throw error
  }
}

// What the client said, without parameters such as `; charset=utf-8`; `application/octet-stream` says nothing.
const declaredType = (declared?: string) => {
  const type = declared?.split(';', 1)[0]!.trim().toLowerCase()
  return type && type !== octetStream ? type : undefined
}

const decided = (type: string, hints: Array<string | undefined>): TypeDecision => {
  const from = hints.find((hint) => hint !== undefined && hint !== type)
  return { type, extension: canonicalExtension(type)!, ...(from && { corrected: { from, to: type } }) }
}

/**
 * The type of an upload, decided once from three signals: the content's magic bytes (C), the name's extension (E) and the
 * client's declared type (H). A recognized C always wins. Unrecognized text takes E when it is a text type, H when there
 * is no extension, otherwise text/plain. Unrecognized binary takes E only when the field lists it exactly and H does not
 * disagree; anything else is application/octet-stream. H never decides on its own.
 */
export const decideType = async ({ head, complete, name, declared, accept }: DecideInput): Promise<TypeDecision> => {
  const fromName = name === undefined ? undefined : typeOfExtension(name)
  const hasExtension = name !== undefined && /\.[^.]+$/.test(name)
  const header = declaredType(declared)
  const hints = [fromName, header]

  const detected = await fileTypeFromBuffer(head)
  if (detected) return decided(isKnownType(detected.mime) ? detected.mime : octetStream, hints)

  if (isText(head, complete)) {
    if (fromName && textTypes.has(fromName)) return decided(fromName, hints)
    if (!hasExtension && header && textTypes.has(header)) return decided(header, hints)
    return decided('text/plain', hints)
  }

  const listed = fromName !== undefined && fromName !== octetStream && accept.includes(fromName)
  if (listed && (header === undefined || header === fromName)) return decided(fromName, hints)
  return decided(octetStream, hints)
}
