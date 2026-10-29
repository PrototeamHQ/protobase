import { decodeBinaryFrame, encodeBinaryFrame } from './binary-frame'
import type { ChannelUser } from './channel-protocol'

/**
 * A broadcast as the hub carries it between the connections on a channel and the processes: the payload and who sent
 * it, a user stamped from their session or, with `server`, the app's own code. A payload of bytes is an `ArrayBuffer`.
 */
export type Sent = { user: ChannelUser; server?: true; payload: unknown }

/** The sender as a broadcast message names it. */
export const senderOf = (sent: Sent) => ({ user: sent.user, ...(sent.server && { server: true as const }) })

/**
 * A broadcast as the hub's payload. One of bytes goes as one binary frame, its sender the header, since the relay
 * carries a payload of bytes as they are and any other as JSON, which has no bytes.
 */
export const packSent = (sent: Sent): unknown => (sent.payload instanceof ArrayBuffer ? encodeBinaryFrame(senderOf(sent), sent.payload) : sent)

/** The broadcast a hub's payload carries (`packSent`). */
export const unpackSent = (packed: unknown): Sent => {
  if (!(packed instanceof ArrayBuffer)) return packed as Sent
  const { header, bytes } = decodeBinaryFrame(packed)!
  return { user: header.user as ChannelUser, ...(header.server === true && { server: true as const }), payload: bytes }
}
