/** A change the app noticed on a relay channel: which record of which resource, never its values (`change` events). */
export type RelayNotice = {
  kind: 'create' | 'update' | 'delete' | 'undelete'
  resource: string
  key: string
  /** The channel it was noticed on, `<resource>/<key>`. */
  channel: string
  /** The user ids the record mentions, when the channel resource names a `mentions` field. */
  mentions?: string[]
}

/**
 * An event another person's client sent through the relay, stamped by the relay: who sent it (`from.user`, and
 * `from.connection` for the sending socket), when (`at`, milliseconds), and the channel it went to, or `to` for a direct
 * event. The payload is as the sender wrote it and the relay checked it against the app's declaration.
 */
export type RelayEvent = {
  event: string
  payload: Record<string, unknown>
  from: { user: string; connection: string }
  at: number
  channel?: string
  to?: string
}

/** The relay's connection: `connecting`, also between tries; `open`; `ended` once the app refused a ticket or the relay closed the connection for good, such as for a session that ended. */
export type RelayStatus = 'connecting' | 'open' | 'ended'

export type RelayHandlers = {
  /** Each change notice, of every channel the socket joined. */
  onNotice?: (notice: RelayNotice) => void
  /** Each event another client sent, on a channel or directly. */
  onEvent?: (event: RelayEvent) => void
  /**
   * The socket connected again after it was down: notices and events went by unheard meanwhile, so read again what is
   * shown. Not called for the first connection.
   */
  onResync?: () => void
  onStatus?: (status: RelayStatus) => void
  /**
   * The socket joined a channel the person was added to after it connected, such as a new direct message, `<resource>/<key>`:
   * its notices come from now on, so read again what is shown.
   */
  onJoined?: (channel: string) => void
  /** Any other event the app publishes on a channel, such as one of its functions' own, with its channel. */
  onPublished?: (published: { channel: string; event: string; payload: Record<string, unknown> }) => void
}

/** The relay refused what the client sent, with its reason, such as `rate_limited`, or `disconnected` while the socket was down. */
export class RelayRefusal extends Error {
  constructor(readonly reason: string) {
    super(`The relay refused it: ${reason}`)
    this.name = 'RelayRefusal'
  }
}
