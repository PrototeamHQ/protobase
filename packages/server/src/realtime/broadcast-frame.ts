import type { PhoenixMessage } from './phoenix-message'

// realtime-js 2.x on vsn 2.0.0 sends a user broadcast as a binary frame of this kind, and reads them as the other.
const userBroadcastPush = 3
const userBroadcast = 4
const binaryEncoding = 0
const jsonEncoding = 1

const decoder = new TextDecoder()
const encoder = new TextEncoder()

/**
 * A binary frame as the `broadcast` push it carries: a header of kind, the byte lengths of join ref, ref, topic, user
 * event and metadata, and the payload's encoding, then those fields and the payload. The metadata is dropped, as only
 * keys the server knows go in it. `undefined` for a frame of another kind or one cut short.
 */
export const decodeBroadcastPush = (frame: ArrayBuffer): PhoenixMessage | undefined => {
  const bytes = new Uint8Array(frame)
  if (bytes.length < 7 || bytes[0] !== userBroadcastPush) return undefined
  const [joinRefSize, refSize, topicSize, eventSize, metadataSize, encoding] = bytes.subarray(1, 7)
  let offset = 7
  const field = (size: number) => decoder.decode(bytes.subarray(offset, (offset += size)))
  const joinRef = field(joinRefSize!)
  const ref = field(refSize!)
  const topic = field(topicSize!)
  const event = field(eventSize!)
  offset += metadataSize!
  if (offset > bytes.length) return undefined
  const body = frame.slice(offset)
  let payload: unknown = body
  if (encoding === jsonEncoding) {
    try {
      payload = JSON.parse(decoder.decode(body))
    } catch (error) {
      if (error instanceof SyntaxError) return undefined
      throw error
    }
  }
  return { joinRef: joinRef || null, ref: ref || null, topic, event: 'broadcast', payload: { type: 'broadcast', event, payload } }
}

/** Whether a topic or event fits a binary frame's one-byte length. */
export const fitsFrame = (text: string) => encoder.encode(text).length <= 255

/**
 * A broadcast as the binary frame realtime-js reads: kind, topic, user event and metadata lengths, encoding, fields,
 * payload. A payload is JSON, or the bytes of a binary broadcast.
 */
export const encodeBroadcast = (topic: string, event: string, payload: unknown): ArrayBuffer => {
  const topicBytes = encoder.encode(topic)
  const eventBytes = encoder.encode(event)
  const binary = payload instanceof ArrayBuffer
  const body = binary ? new Uint8Array(payload) : encoder.encode(JSON.stringify(payload ?? {}))
  // The socket refuses a broadcast whose topic or event does not fit (`fitsFrame`), so this is never reached.
  if (topicBytes.length > 255 || eventBytes.length > 255) throw new Error('A broadcast topic and event are at most 255 bytes each')
  const frame = new Uint8Array(5 + topicBytes.length + eventBytes.length + body.length)
  frame.set([userBroadcast, topicBytes.length, eventBytes.length, 0, binary ? binaryEncoding : jsonEncoding])
  frame.set(topicBytes, 5)
  frame.set(eventBytes, 5 + topicBytes.length)
  frame.set(body, 5 + topicBytes.length + eventBytes.length)
  return frame.buffer
}
