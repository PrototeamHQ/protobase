import type { CallRingInput } from './call-ring'
import type { CallRemoteTrack, CallTrackSource } from '@protobase/schema/internal'

/** What a member may send and hear in a call. */
export type CallRights = {
  /** Whether the member may send media, or only these sources; nothing when `false`. */
  publish: boolean | CallTrackSource[]
  /** Which of the other members' tracks the member hears; every one by default. */
  hears?: (track: CallRemoteTrack) => boolean
}

/** A record's key, as the records of a function take it: one value, or the values of a key of several fields. */
export type CallRecordKey = string | number | Array<string | number>

/** One member admitted to the call on a record, with what they may send and hear. */
export type CallMember = CallRights & {
  /** The record the call is on: whoever reads it sees its calls. The caller must be able to read it to join. */
  record: { resource: string; key: CallRecordKey }
  /**
   * Who joins, unique in the call, such as the signed-in user's id: take it from the caller, never from the request,
   * since the other members know them by it.
   */
  member: string
  /** The function's own checks, repeated every minute after the record's, such as whether the caller is still invited. */
  recheck?: () => unknown
  /** Whom the call rings, on any page of the app they have open, when this join starts it. */
  ring?: CallRingInput
}

/** A member in a call as a media plugin knows them: the call by its id, and who they are in it. */
export type SessionMember = CallRights & { call: string; member: string }
