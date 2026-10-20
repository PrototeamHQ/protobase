/** One part of a `multipart/form-data` body: its field name, its file name and type when it is a file, and its bytes. */
export type Part = { name: string; filename?: string; type?: string; body: Uint8Array }

const encoder = new TextEncoder()
const decoder = new TextDecoder()

// Where `needle` starts in `haystack` at or after `from`, else -1.
const indexOf = (haystack: Uint8Array, needle: Uint8Array, from: number) => {
  for (let at = haystack.indexOf(needle[0]!, from); at !== -1 && at + needle.length <= haystack.length; at = haystack.indexOf(needle[0]!, at + 1)) {
    let index = 1
    while (index < needle.length && haystack[at + index] === needle[index]) index += 1
    if (index === needle.length) return at
  }
  return -1
}

/** The boundary of a `multipart/form-data` Content-Type, else `undefined`. */
export const boundaryOf = (contentType: string) => /;\s*boundary=(?:"([^"]+)"|([^;\s]+))/i.exec(contentType)?.slice(1).find(Boolean)

const headerValue = (headers: string, name: string) => new RegExp(`^${name}:\\s*(.*)$`, 'im').exec(headers)?.[1]?.trim()
const parameter = (disposition: string, name: string) => new RegExp(`;\\s*${name}="([^"]*)"`, 'i').exec(disposition)?.[1]

/**
 * The parts of a whole `multipart/form-data` body, every one kept, also a file part with an empty field name, as
 * storage-js sends a `Blob`: Bun's `formData()` drops it. Undefined when the body does not parse.
 */
export const multipartParts = (bytes: Uint8Array, boundary: string): Part[] | undefined => {
  const delimiter = encoder.encode(`--${boundary}`)
  const next = encoder.encode(`\r\n--${boundary}`)
  const parts: Part[] = []
  let at = indexOf(bytes, delimiter, 0)
  if (at === -1) return undefined
  at += delimiter.length
  while (decoder.decode(bytes.subarray(at, at + 2)) !== '--') {
    if (decoder.decode(bytes.subarray(at, at + 2)) !== '\r\n') return undefined
    const headersEnd = indexOf(bytes, encoder.encode('\r\n\r\n'), at + 2)
    const end = headersEnd === -1 ? -1 : indexOf(bytes, next, headersEnd + 4)
    if (end === -1) return undefined
    const headers = decoder.decode(bytes.subarray(at + 2, headersEnd))
    const disposition = headerValue(headers, 'content-disposition') ?? ''
    const filename = parameter(disposition, 'filename')
    const type = headerValue(headers, 'content-type')
    parts.push({ name: parameter(disposition, 'name') ?? '', ...(filename !== undefined && { filename }), ...(type && { type }), body: bytes.subarray(headersEnd + 4, end) })
    at = end + next.length
  }
  return parts
}
