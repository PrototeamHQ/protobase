const encoder = new TextEncoder()
const decoder = new TextDecoder()

// The header's byte length, a big-endian 32-bit integer.
const lengthBytes = 4

/**
 * A binary frame of `/api/channels`: the byte length of a JSON header, the header, then the bytes it carries. A binary
 * broadcast travels as one, its header the message without its payload.
 */
export const encodeBinaryFrame = (header: Record<string, unknown>, bytes: ArrayBuffer): ArrayBuffer => {
  const head = encoder.encode(JSON.stringify(header))
  const frame = new Uint8Array(lengthBytes + head.length + bytes.byteLength)
  new DataView(frame.buffer).setUint32(0, head.length)
  frame.set(head, lengthBytes)
  frame.set(new Uint8Array(bytes), lengthBytes + head.length)
  return frame.buffer
}

/** The header and bytes of a binary frame, or `undefined` for one cut short or whose header is not a JSON object. */
export const decodeBinaryFrame = (frame: ArrayBuffer): { header: Record<string, unknown>; bytes: ArrayBuffer } | undefined => {
  if (frame.byteLength < lengthBytes) return
  const end = lengthBytes + new DataView(frame).getUint32(0)
  if (end > frame.byteLength) return
  const header = parsed(decoder.decode(new Uint8Array(frame, lengthBytes, end - lengthBytes)))
  if (typeof header !== 'object' || header === null || Array.isArray(header)) return
  return { header: header as Record<string, unknown>, bytes: frame.slice(end) }
}

const parsed = (text: string) => {
  try {
    return JSON.parse(text) as unknown
  } catch (error) {
    if (error instanceof SyntaxError) return
    throw error
  }
}

/** The bytes of an `ArrayBuffer` or a typed array, as an `ArrayBuffer` of their own; `undefined` for anything else. */
export const bytesOf = (value: unknown): ArrayBuffer | undefined => {
  if (value instanceof ArrayBuffer) return value
  if (!ArrayBuffer.isView(value)) return
  return new Uint8Array(value.buffer, value.byteOffset, value.byteLength).slice().buffer
}
