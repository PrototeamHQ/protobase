import { boundaryOf, multipartParts } from './multipart'
import { invalidRequest, tooLarge } from './storage-error'

/** An upload as storage-js sends it: the bytes, their type and length, and what to keep beside them. */
export type IncomingObject = { body: ReadableStream<Uint8Array>; type: string; length?: number; cacheControl: string; userMetadata: Record<string, unknown> | null }

// storage-js's own defaults, for a client that leaves them out.
const defaultType = 'text/plain;charset=UTF-8'
const defaultCacheControl = 'max-age=3600'

const parsedMetadata = (text: string | null) => {
  if (text === null) return null
  try {
    const value: unknown = JSON.parse(text)
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) return value as Record<string, unknown>
  } catch (error) {
    if (!(error instanceof SyntaxError)) throw error
  }
  throw invalidRequest('The metadata is not a JSON object')
}

const fromBase64 = (text: string) => {
  try {
    return new TextDecoder().decode(Uint8Array.from(atob(text), (char) => char.charCodeAt(0)))
  } catch (error) {
    if (error instanceof DOMException && error.name === 'InvalidCharacterError') throw invalidRequest('The x-metadata header is not base64')
    throw error
  }
}

/** `body`, failing with 413 `EntityTooLarge` once it passes `maxBytes`. */
export const limitedBody = (body: ReadableStream<Uint8Array>, maxBytes: number) => {
  let size = 0
  return body.pipeThrough(new TransformStream<Uint8Array, Uint8Array>({
    transform: (chunk, controller) => {
      size += chunk.length
      if (size > maxBytes) throw tooLarge()
      controller.enqueue(chunk)
    },
  }))
}

/**
 * The object of an upload request: a raw body with its Content-Type, `Cache-Control` and the base64 JSON of
 * `x-metadata`, or the file part of a `multipart/form-data` body with its type and the `cacheControl` and `metadata`
 * fields, as storage-js sends a `Blob` or `File` (see `multipartParts`). A multipart body is read whole, after its length is checked; a raw
 * body streams. Past `maxBytes` it is 413 `EntityTooLarge`.
 */
export const incomingObject = async (request: Request, maxBytes: number): Promise<IncomingObject> => {
  const header = request.headers.get('content-length')
  const length = header === null ? undefined : Number(header)
  const contentType = request.headers.get('content-type') ?? defaultType
  if (!contentType.toLowerCase().startsWith('multipart/form-data')) {
    if (length !== undefined && length > maxBytes) throw tooLarge()
    const metadata = request.headers.get('x-metadata')
    return {
      body: limitedBody(request.body ?? new Blob([]).stream(), maxBytes),
      type: contentType,
      ...(length !== undefined && { length }),
      cacheControl: request.headers.get('cache-control') ?? defaultCacheControl,
      userMetadata: parsedMetadata(metadata === null ? null : fromBase64(metadata)),
    }
  }
  // Part headers and the other fields, besides the file.
  if (length !== undefined && length > maxBytes + 64 * 1024) throw tooLarge()
  const boundary = boundaryOf(contentType)
  const parts = boundary === undefined ? undefined : multipartParts(new Uint8Array(await request.arrayBuffer()), boundary)
  if (!parts) throw invalidRequest('The multipart body does not parse')
  const file = parts.find((part) => part.filename !== undefined)
  if (!file) throw invalidRequest('The multipart body has no file')
  if (file.body.length > maxBytes) throw tooLarge()
  const field = (name: string) => {
    const part = parts.find((one) => one.name === name && one.filename === undefined)
    return part ? new TextDecoder().decode(part.body) : null
  }
  const cacheControl = field('cacheControl')
  return {
    body: new Blob([file.body as Uint8Array<ArrayBuffer>]).stream(),
    type: file.type ?? defaultType,
    length: file.body.length,
    cacheControl: cacheControl === null ? defaultCacheControl : `max-age=${cacheControl}`,
    userMetadata: parsedMetadata(field('metadata')),
  }
}
