import type { ChannelUser } from './channel-protocol'

/**
 * A broadcast as the hub carries it between the connections on a channel and the processes: the payload and who sent
 * it, a user stamped from their session or, with `server`, the app's own code.
 */
export type Sent = { user: ChannelUser; server?: true; payload: unknown }

/** The sender as a broadcast message names it. */
export const senderOf = (sent: Sent) => ({ user: sent.user, ...(sent.server && { server: true as const }) })
