import { decodeBinaryFrame } from './binary-frame'

/** Who sent a broadcast or tracks a presence, as the server stamps it from the session: the user's id, `null` for a visitor. */
export type ChannelUser = string | number | null

/** One connection's presence on a channel: its id, the same while it is tracked, its user and the state it tracks. */
export type PresenceEntry = { id: string; user: ChannelUser; state: unknown }

/** Why the server refused a message or ended a channel, by a code a client can tell apart, and in words. */
export type ChannelError = { code: string; message: string }

/**
 * What a client sends over `/api/channels`, each a JSON text frame, or a send of bytes a binary one (`decodeBinaryMessage`). `ref`, when given, comes back on the reply. `token`
 * hands over the bearer token the connection's session is checked with from now on, once the one it opened with expires.
 */
export type ClientMessage =
  | { type: 'ping' }
  | { type: 'token'; token: string }
  | { type: 'join'; ref?: string; resource: string; key: string }
  | { type: 'leave'; ref?: string; channel: string }
  | { type: 'track'; ref?: string; channel: string; state: unknown }
  | { type: 'untrack'; ref?: string; channel: string }
  | { type: 'send'; ref?: string; channel: string; event: string; payload: unknown; self?: boolean; ack?: boolean }

/**
 * What the server sends. A join's reply names the channel the other messages use; `presence` is its whole presence,
 * sent once joined, and `presence_diff` each change after: an entry that joined, one whose state changed, one that left.
 * `closed` ends a channel the server left, such as once the caller may no longer read its record.
 */
export type ServerMessage =
  | { type: 'pong' }
  | { type: 'reply'; ref: string; ok: true; channel?: string }
  | { type: 'reply'; ref: string; ok: false; error: ChannelError }
  | { type: 'error'; error: ChannelError }
  | { type: 'presence'; channel: string; entries: PresenceEntry[] }
  | { type: 'presence_diff'; channel: string; joins: PresenceEntry[]; updates: PresenceEntry[]; leaves: PresenceEntry[] }
  /** A payload of bytes, an `ArrayBuffer`, goes as a binary frame (`encodeBinaryFrame`), the message without it its header. */
  | { type: 'broadcast'; channel: string; event: string; payload: unknown; user: ChannelUser; server?: true }
  | { type: 'closed'; channel: string; error: ChannelError }

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)

const text = (value: unknown) => typeof value === 'string'

/** The message a text frame carries, or `undefined` for one that is not JSON or not a message. */
export const decodeClientMessage = (frame: string): ClientMessage | undefined => messageOf(parsed(frame))

/**
 * The send of bytes a binary frame carries (`decodeBinaryFrame`): its header a `send` without a payload, its bytes the
 * payload. `undefined` for any other frame.
 */
export const decodeBinaryMessage = (frame: ArrayBuffer): ClientMessage | undefined => {
  const decoded = decodeBinaryFrame(frame)
  if (!decoded || decoded.header.type !== 'send' || 'payload' in decoded.header) return
  return messageOf({ ...decoded.header, payload: decoded.bytes })
}

const messageOf = (message: unknown): ClientMessage | undefined => {
  if (!isRecord(message)) return
  if (message.ref !== undefined && !text(message.ref)) return
  const { type } = message
  if (type === 'ping') return { type }
  if (type === 'token') return text(message.token) ? { type, token: message.token as string } : undefined
  if (type === 'join') return text(message.resource) && text(message.key) ? (message as ClientMessage) : undefined
  if (!text(message.channel)) return
  if (type === 'leave' || type === 'untrack') return message as ClientMessage
  if (type === 'track') return 'state' in message ? (message as ClientMessage) : undefined
  if (type !== 'send' || !text(message.event) || !('payload' in message)) return
  if (message.self !== undefined && typeof message.self !== 'boolean') return
  if (message.ack !== undefined && typeof message.ack !== 'boolean') return
  return message as ClientMessage
}

const parsed = (frame: string) => {
  try {
    return JSON.parse(frame) as unknown
  } catch (error) {
    if (error instanceof SyntaxError) return
    throw error
  }
}
