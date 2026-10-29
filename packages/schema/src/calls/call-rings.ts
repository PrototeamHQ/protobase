/**
 * A call that rings the signed-in user now, as the open pages of the app show it: the call, its record, who started
 * it, the ring's text, and how many milliseconds it still rings, by the server's clock.
 */
export type CallRing = {
  call: string
  resource: string
  /** The record's key as its URL has it. */
  key: string
  started_by: string
  title: string
  body: string | null
  remaining_ms: number
}

/**
 * The resource name of the notices the live stream sends a user when the calls that ring them change, keyed by the
 * user's id: no resource has a `$` in its name.
 */
export const ringNotice = '$rings'

/** Decline, as a ring's path takes it. */
export const declineWord = 'decline'

/**
 * The path of the calls that ring the caller under the API's system path (`/api`), or of declining the ring of one
 * call, `{ decline: call }`.
 */
export const ringsPath = (systemPath: string, part?: { decline: string }) => {
  const base = `${systemPath}/calls/rings`
  if (part === undefined) return base
  return `${base}/${encodeURIComponent(part.decline)}/${declineWord}`
}

/** The event a record's channel hears its calls on, from the server, with `{ items }` as `GET /{resource}/{key}:calls` answers. */
export const callsChannelEvent = 'calls'
