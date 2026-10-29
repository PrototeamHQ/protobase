import type { CallClientMessage, CallServerMessage } from '@protobase/schema/internal'
import type { CallMember } from './call-member'

/** What a member's session answers the member's browser with, through the relay. */
export type MemberLink = {
  send: (message: CallServerMessage) => void
  /** Ends the member's socket: `1000` once they left, `resumeCloseCode` to have the browser resume on a new socket. */
  close: (code: number, reason: string) => void
}

/** How a member's socket ended: they left or Protobase refused them (`left`), or it was lost and may be resumed. */
export type MemberEnd = 'left' | 'lost'

/** One member's media session in a backend, which lives as long as the member's socket in this process. */
export type MemberSession = {
  /** A message of the member's browser, already checked: a well-formed call message, after `join` or `resume`. */
  receive: (message: CallClientMessage) => void | Promise<void>
  /** The member's socket ended; with `left`, the member is out of the call. */
  end: (how: MemberEnd) => void
}

/**
 * A media plugin: where the relay sends members' negotiation. A media server plugin speaks for each member to the media
 * server; the peer plugin passes it between the members' browsers. Each runs in the Protobase server's own process.
 */
export type MediaBackend = {
  open: (member: CallMember, link: MemberLink) => MemberSession
}

/** The close code that has the browser resume on a new socket: the server lost its session, not the member. */
export const resumeCloseCode = 4000
