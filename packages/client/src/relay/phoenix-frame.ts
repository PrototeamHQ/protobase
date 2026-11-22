/** A Phoenix channels V2 frame, `[join_ref, ref, topic, event, payload]`, as the relay speaks it. */
export type Frame = { joinRef: string | null; ref: string | null; topic: string; event: string; payload: Record<string, unknown> }

export const encodeFrame = ({ joinRef, ref, topic, event, payload }: Frame) => JSON.stringify([joinRef, ref, topic, event, payload])

// The text as JSON, or undefined for text that is none.
const parsedJson = (data: string): unknown => {
  try {
    return JSON.parse(data)
  } catch (error) {
    if (error instanceof SyntaxError) return
    throw error
  }
}

/** The frame in a text message, or undefined for anything that is no V2 frame, JSON or not. */
export const decodeFrame = (data: string): Frame | undefined => {
  const parsed = parsedJson(data)
  if (!Array.isArray(parsed) || parsed.length !== 5) return
  const [joinRef, ref, topic, event, payload] = parsed as unknown[]
  if (typeof topic !== 'string' || typeof event !== 'string' || typeof payload !== 'object' || payload === null) return
  return { joinRef: typeof joinRef === 'string' ? joinRef : null, ref: typeof ref === 'string' ? ref : null, topic, event, payload: payload as Record<string, unknown> }
}

/** A `phx_reply`'s outcome: `ok`, or `error` with the relay's reason, such as `unauthorized`. */
export const replyOf = (payload: Record<string, unknown>) => {
  const response = (payload.response ?? {}) as Record<string, unknown>
  return payload.status === 'ok' ? { ok: true as const } : { ok: false as const, reason: typeof response.reason === 'string' ? response.reason : 'error' }
}
