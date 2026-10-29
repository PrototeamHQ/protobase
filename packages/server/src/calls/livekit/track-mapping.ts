import { ParticipantInfo, ParticipantInfo_State, TrackSource, TrackType, VideoQuality, type TrackInfo } from '@livekit/protocol'
import type { CallRemoteTrack, CallTrackSource, CallVideoLayer } from '@protobase/schema/internal'

const sources: Record<CallTrackSource, TrackSource> = {
  camera: TrackSource.CAMERA,
  microphone: TrackSource.MICROPHONE,
  screen: TrackSource.SCREEN_SHARE,
  'screen-audio': TrackSource.SCREEN_SHARE_AUDIO,
}

/** The names LiveKit's token grants give each source in `canPublishSources`. */
export const grantSources: Record<CallTrackSource, string> = { camera: 'camera', microphone: 'microphone', screen: 'screen_share', 'screen-audio': 'screen_share_audio' }

export const liveKitSource = (source: CallTrackSource) => sources[source]

/** A LiveKit source as the call protocol names it; an unknown one counts as the camera or microphone of its kind. */
export const callSource = (source: TrackSource, type: TrackType): CallTrackSource => {
  const found = (Object.keys(sources) as CallTrackSource[]).find((name) => sources[name] === source)
  return found ?? (type === TrackType.AUDIO ? 'microphone' : 'camera')
}

export const liveKitQuality = (quality: CallVideoLayer['quality']) => ({ low: VideoQuality.LOW, medium: VideoQuality.MEDIUM, high: VideoQuality.HIGH })[quality]

const remoteTrack = (member: string, track: TrackInfo): CallRemoteTrack => ({
  sid: track.sid,
  member,
  kind: track.type === TrackType.AUDIO ? 'audio' : 'video',
  source: callSource(track.source, track.type),
  muted: track.muted,
})

/** The audio and video tracks of the participants that are still in the room, each under its participant's identity. */
export const remoteTracksOf = (participants: ParticipantInfo[]) =>
  participants
    .filter((participant) => participant.state !== ParticipantInfo_State.DISCONNECTED)
    .flatMap((participant) => participant.tracks.filter((track) => track.type !== TrackType.DATA).map((track) => remoteTrack(participant.identity, track)))
