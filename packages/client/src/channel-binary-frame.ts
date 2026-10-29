const encoder = new TextEncoder()
const decoder = new TextDecoder()

// The header's byte length, a big-endian 32-bit integer.
const lengthBytes = 4

/**
 * A binary frame of `/api/channels`, which carries a broadcast of bytes: the byte length of a JSON header, the header,
 * the message without its payload, then the payload's bytes.
 */
export const encodeBinaryFrame = (header: Record<string, unknown>, bytes: ArrayBuffer | ArrayBufferView): ArrayBuffer => {
  const head = encoder.encode(JSON.stringify(header))
  const body = bytes instanceof ArrayBuffer ? new Uint8Array(bytes) : new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const frame = new Uint8Array(lengthBytes + head.length + body.length)
  new DataView(frame.buffer).setUint32(0, head.length)
  frame.set(head, lengthBytes)
  frame.set(body, lengthBytes + head.length)
  return frame.buffer
}

/** The message a binary frame from the server carries, its bytes as its `payload`. */
export const decodeBinaryFrame = (frame: ArrayBuffer): Record<string, unknown> => {
  const end = lengthBytes + new DataView(frame).getUint32(0)
  const header = JSON.parse(decoder.decode(new Uint8Array(frame, lengthBytes, end - lengthBytes))) as Record<string, unknown>
  return { ...header, payload: frame.slice(end) }
}

/** Whether a payload is bytes, sent as a binary frame. */
export const isBytes = (payload: unknown): payload is ArrayBuffer | ArrayBufferView => payload instanceof ArrayBuffer || ArrayBuffer.isView(payload)
