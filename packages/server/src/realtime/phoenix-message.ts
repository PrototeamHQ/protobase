/** A Phoenix channels message, as realtime-js sends and reads them. */
export type PhoenixMessage = {
  joinRef: string | null
  ref: string | null
  topic: string
  event: string
  payload: Record<string, unknown>
}

/** The serializer versions realtime-js speaks: `1.0.0` sends objects, `2.0.0` (its default) arrays. */
export type Vsn = '1.0.0' | '2.0.0'

export const vsnOf = (value: string | undefined): Vsn | undefined => {
  if (value === undefined || value === '2.0.0') return '2.0.0'
  return value === '1.0.0' ? '1.0.0' : undefined
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)

const text = (value: unknown) => (typeof value === 'string' ? value : value === null || value === undefined ? null : String(value))

/** A text frame as a message; `undefined` for one that is not a Phoenix message. Binary frames carry broadcasts only. */
export const decodeMessage = (vsn: Vsn, frame: string): PhoenixMessage | undefined => {
  let parsed: unknown
  try {
    parsed = JSON.parse(frame)
  } catch (error) {
    if (error instanceof SyntaxError) return undefined
    throw error
  }
  if (vsn === '2.0.0') {
    if (!Array.isArray(parsed) || parsed.length !== 5) return undefined
    const [joinRef, ref, topic, event, payload] = parsed as unknown[]
    if (typeof topic !== 'string' || typeof event !== 'string' || !isRecord(payload)) return undefined
    return { joinRef: text(joinRef), ref: text(ref), topic, event, payload }
  }
  if (!isRecord(parsed) || typeof parsed.topic !== 'string' || typeof parsed.event !== 'string' || !isRecord(parsed.payload)) return undefined
  return { joinRef: text(parsed.join_ref), ref: text(parsed.ref), topic: parsed.topic, event: parsed.event, payload: parsed.payload }
}

export const encodeMessage = (vsn: Vsn, message: PhoenixMessage) =>
  JSON.stringify(
    vsn === '2.0.0'
      ? [message.joinRef, message.ref, message.topic, message.event, message.payload]
      : { join_ref: message.joinRef, ref: message.ref, topic: message.topic, event: message.event, payload: message.payload },
  )

/** The answer to a pushed message: `phx_reply` with its ref. */
export const reply = (to: PhoenixMessage, status: 'ok' | 'error', response: Record<string, unknown>): PhoenixMessage => ({
  joinRef: to.joinRef,
  ref: to.ref,
  topic: to.topic,
  event: 'phx_reply',
  payload: { status, response },
})
