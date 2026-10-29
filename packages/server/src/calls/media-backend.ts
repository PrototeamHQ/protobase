import type { CallCandidate, CallClientMessage, CallDescription, CallRemoteTrack, CallServerMessage } from '@protobase/schema/internal'
import type { SessionMember } from './call-member'
import type { RosterMember } from './call-reads'

/** A description or candidate one member's browser sends another's. */
export type SignalBody = { description?: CallDescription; candidate?: CallCandidate }

/** What a member's media session hears of the call it is in, and does in it. */
export type CallRoom = {
  /** The call, as its record names it. */
  call: string
  /** The tracks the member sends now. */
  tracks: (tracks: CallRemoteTrack[]) => Promise<void>
  /** Passes a description or candidate to another member of the call; nothing when they are not in it. */
  signal: (to: string, body: SignalBody) => Promise<void>
}

/** Where a member in the call hears who is in it, whenever that changes. */
export type RosterListener = (members: RosterMember[]) => void

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
  /** Who is in the call now, the member too, whenever that changes. */
  roster?: RosterListener
}

/**
 * A media plugin: where the relay sends members' negotiation. A media server plugin speaks for each member to the media
 * server; the peer plugin passes it between the members' browsers. Each runs in the Protobase server's own process.
 */
export type MediaBackend = {
  /** The member's session, once Protobase let them into the call `room` names. */
  open: (member: SessionMember, link: MemberLink, room: CallRoom) => MemberSession
}

/** The close code that has the browser resume on a new socket: the server lost its session, not the member. */
export const resumeCloseCode = 4000
