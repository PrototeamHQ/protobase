// One member's page: @protobase/client/calls as an app bundles it, driven by the contract test through `window.member`.
// The browsers' fake devices stand in for the camera and microphone.
import { joinCall, type Call, type CallRosterMember, type CallState, type CallTrack, type CallTrackSource } from '@protobase/client/calls'

let call: Call | undefined
let pc: RTCPeerConnection | undefined
const connections: RTCPeerConnection[] = []
let members: CallRosterMember[] = []
let left: string | undefined
let tracks: CallTrack[] = []
const states: CallState['state'][] = []
const unpublished: CallTrackSource[] = []
const speaking = new Set<string>()
const local: Partial<Record<CallTrackSource, MediaStreamTrack>> = {}

// Chrome decodes the video a page shows, so every remote video track gets an element.
const show = (list: CallTrack[]) => {
  for (const track of list) {
    if (track.kind !== 'video' || !track.track || document.querySelector(`[data-sid="${track.sid}"]`)) continue
    const video = Object.assign(document.createElement('video'), { autoplay: true, muted: true, playsInline: true, srcObject: new MediaStream([track.track]) })
    video.dataset.sid = track.sid
    document.body.append(video)
  }
}

const member = {
  join: async (query: string) => {
    call = await joinCall({
      url: `/api/functions/meeting?${query}`,
      onTracks: (list) => {
        tracks = list
        show(list)
      },
      onState: (state) => {
        states.push(state.state)
        if (state.state === 'left') left = state.reason
      },
      onMembers: (list) => void (members = list),
      onUnpublished: (source) => void unpublished.push(source),
      onSpeakers: (speakers) => speakers.forEach(({ member: who, level }) => (level > 0 ? speaking.add(who) : speaking.delete(who))),
      retryDelayMs: () => 200,
      createPeerConnection: (configuration) => {
        pc = new RTCPeerConnection(configuration)
        connections.push(pc)
        return pc
      },
    })
    return call.participant
  },
  /** Joins, or says why the member could not: the reason they left with. */
  tryJoin: (query: string) => member.join(query).then(() => 'joined', () => left ?? 'no reason'),
  members: () => members.map((present) => present.member),
  callId: () => call?.id,
  left: () => left,
  /** The peer connections to other members that are not closed. */
  openConnections: () => connections.filter((connection) => connection.connectionState !== 'closed' && connection.signalingState !== 'closed').length,
  publish: async (sources: CallTrackSource[], simulcast = false) => {
    const media = await navigator.mediaDevices.getUserMedia({ video: sources.includes('camera') && { width: 640, height: 360 }, audio: sources.includes('microphone') })
    if (sources.includes('camera')) local.camera = media.getVideoTracks()[0]!
    if (sources.includes('microphone')) local.microphone = media.getAudioTracks()[0]!
    await call!.publish(Object.fromEntries(sources.map((source) => [source, local[source]!])), { simulcast })
  },
  publishRefusal: () => member.publish(['microphone']).then(() => 'published', (error: Error) => error.message),
  unpublish: (source: CallTrackSource) => call!.unpublish(source),
  mute: (source: CallTrackSource, muted: boolean) => call!.mute(source, muted),
  view: (sids: string[], width: number, height: number) => call!.view(sids, { width, height }),
  restartIce: () => call!.restartIce(),
  leave: () => call!.leave(),
  tracks: () => tracks.map(({ track, ...rest }) => ({ ...rest, receiving: track?.readyState === 'live' })),
  states: () => states,
  unpublished: () => unpublished,
  speaking: () => [...speaking],
  /** What arrives over the peer connection by kind: bytes, decoded frames and the widest decoded frame. */
  received: async () => {
    const totals = { audio: { bytes: 0 }, video: { bytes: 0, frames: 0, width: 0 } }
    for (const report of (await pc!.getStats()).values()) {
      if (report.type !== 'inbound-rtp') continue
      if (report.kind === 'audio') totals.audio.bytes += report.bytesReceived ?? 0
      if (report.kind === 'video') {
        totals.video.bytes += report.bytesReceived ?? 0
        totals.video.frames += report.framesDecoded ?? 0
        totals.video.width = Math.max(totals.video.width, report.frameWidth ?? 0)
      }
    }
    return totals
  },
  /** The video frames each open peer connection decoded, one count per connection. */
  framesEach: () =>
    Promise.all(
      connections
        .filter((connection) => connection.connectionState !== 'closed' && connection.signalingState !== 'closed')
        .map(async (connection) => [...(await connection.getStats()).values()].reduce((frames, report) => frames + (report.type === 'inbound-rtp' && report.kind === 'video' ? (report.framesDecoded ?? 0) : 0), 0)),
    ),
  /** The width of the newest decoded frame of one remote video track, as its element shows it. */
  shownWidth: (sid: string) => (document.querySelector<HTMLVideoElement>(`[data-sid="${sid}"]`)?.videoWidth ?? 0),
}

declare global {
  interface Window {
    member: typeof member
  }
}
window.member = member

