/** Who sent a broadcast or tracks a presence, stamped by the server from their session: a user's id, `null` for a visitor. */
export type ChannelUser = string | number | null

/** One connection's presence on a channel: its id, the same while it is tracked, its user and the state it tracks. */
export type PresenceEntry = { id: string; user: ChannelUser; state: unknown }

/** What changed in a channel's presence: connections that started tracking, changed their state, or left. */
export type PresenceChange = { joins: PresenceEntry[]; updates: PresenceEntry[]; leaves: PresenceEntry[] }

/** Why the server refused a message or ended a channel, such as `not-found` for a record the caller may not read. */
export type ChannelError = { code: string; message: string }

/** A broadcast as a channel hears it: with `server`, the app's own code sent it, and `user` is `null`. */
export type ChannelMessage = { event: string; payload: unknown; user: ChannelUser; server?: true }

/**
 * Where a channel stands: `joining`, also while the connection is down; `joined`; `refused`, never joined, as for a
 * record there is none of or the caller may not read; `closed`, left by the server, as once the caller may no longer
 * read the record. A refused or closed channel is not joined again: leave it and take a new one.
 */
export type ChannelStatus = { state: 'joining' | 'joined' } | { state: 'refused' | 'closed'; error: ChannelError }

/** What the server sends on `/api/channels`. */
export type ServerMessage =
  | { type: 'pong' }
  | { type: 'reply'; ref: string; ok: true; channel?: string }
  | { type: 'reply'; ref: string; ok: false; error: ChannelError }
  | { type: 'error'; error: ChannelError }
  | { type: 'presence'; channel: string; entries: PresenceEntry[] }
  | ({ type: 'presence_diff'; channel: string } & PresenceChange)
  | ({ type: 'broadcast'; channel: string } & ChannelMessage)
  | { type: 'closed'; channel: string; error: ChannelError }

/** A refusal of the server, or `disconnected` for a message whose connection dropped before its reply. */
export class ChannelRefusal extends Error {
  constructor(readonly code: string, message: string) {
    super(message)
    this.name = 'ChannelRefusal'
  }
}
