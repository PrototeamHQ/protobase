import type { CallRemoteTrack, CallTrackSource } from '@protobase/schema/internal'

/** One member admitted to one call, with what they may send and hear. */
export type CallMember = {
  /** The call, as the app names it: members with the same call meet. */
  call: string
  /** Who joins, unique in the call, such as the user's id: the media server knows them by nothing else. */
  member: string
  /** Whether the member may send media, or only these sources; nothing when `false`. */
  publish: boolean | CallTrackSource[]
  /** Which of the other members' tracks the member hears; every one by default. */
  hears?: (track: CallRemoteTrack) => boolean
}
