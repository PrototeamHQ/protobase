import type { CallConnection, CallRosterMember, CallTrack } from '@protobase/client/calls'
import { cannotConnect, connectionQuality } from './call-layout'
import type { CallPerson } from './call-person'
import { text } from './messages'

/** What the member sends themselves: their own tracks, and which of them are on. */
export type OwnMedia = { microphone?: MediaStreamTrack; camera?: MediaStreamTrack; screen?: MediaStreamTrack; microphoneOn: boolean; cameraOn: boolean }

export type PeopleInput = {
  members: readonly CallRosterMember[]
  self: string
  tracks: readonly CallTrack[]
  own: OwnMedia
  /** A member's name, by the member, when the call names them not itself; a guest is always named by the name they gave. */
  nameOf: (member: string) => string
  speaker?: string
  connections: readonly CallConnection[]
  /** When this browser first knew of each member, by member: how long their connection has had to come up. */
  seen: ReadonlyMap<string, number>
  now: number
}

const received = (tracks: readonly CallTrack[], source: CallTrack['source']) => tracks.find((track) => track.source === source && track.track)

/** Everyone in the call as the view draws them, in the order they came, the member among them as `self`. */
export const callPeople = ({ members, self, tracks, own, nameOf, speaker, connections, seen, now }: PeopleInput): CallPerson[] => {
  const roster = members.some((member) => member.member === self) ? members : [{ member: self, joined_at: '' }, ...members]
  return roster.map(({ member, name }): CallPerson => {
    const shared = { member, name: member.startsWith('guest:') ? text('guestName', name ?? '') : (name ?? nameOf(member)), ...(speaker === member && { speaking: true }) }
    if (member === self) {
      return { ...shared, self: true, ...(own.camera && { camera: own.camera }), ...(own.microphone && { microphone: own.microphone }), ...(own.screen && { screen: own.screen }), microphoneOff: !own.microphone || !own.microphoneOn, cameraOff: !own.camera || !own.cameraOn }
    }
    const theirs = tracks.filter((track) => track.member === member)
    const [camera, microphone, screen, screenAudio] = (['camera', 'microphone', 'screen', 'screen-audio'] as const).map((source) => received(theirs, source))
    const link = connections.find((connection) => connection.member === member)
    const connection = cannotConnect(link?.state, seen.get(member) ?? now, now) ? 'failed' : link?.state === 'connected' ? connectionQuality(link) : undefined
    return {
      ...shared,
      ...(camera && { camera: camera.track! }),
      ...(microphone && { microphone: microphone.track! }),
      ...(screen && { screen: screen.track! }),
      ...(screenAudio && { screenAudio: screenAudio.track! }),
      microphoneOff: !microphone || microphone.muted,
      cameraOff: !camera || camera.muted,
      ...(connection && { connection }),
    }
  })
}
