import { useState } from 'react'
import { useOptionalAuth } from '../auth/auth-provider'
import { useRouter } from '../app/router'
import type { RouteTarget } from '../primitives/route-link'
import { CallCheck } from './call-check'
import { CallGuestsPanel } from './call-guests-panel'
import { CallLobbyNotice } from './call-lobby-notice'
import { CallMessage } from './call-message'
import { callPeople } from './call-people'
import { CallStage } from './call-stage'
import { CallWaiting } from './call-waiting'
import { guestCallLink } from './guest-call-link'
import { text } from './messages'
import { useActiveSpeaker } from './use-audio-levels'
import { useCallSession, type CallSessionOptions } from './use-call-session'

export type CallViewProps = {
  /** The socket of the app's function that admits the member, as `joinCall` takes it, such as `/api/functions/call?conversation=7`. */
  url: string
  /** Where Leave goes; leaving the page leaves the call. */
  leave: RouteTarget
  /** A member's name, by the member the app's function admits them as, such as a user id; the member itself by default. */
  nameOf?: (member: string) => string
  /** For a guest: their wait in the lobby after Join, which resolves with their token; see `GuestCallPage`. */
  admission?: CallSessionOptions['admission']
  /** The member's own name before joining, when no one is signed in, as a guest's. */
  name?: string
  className?: string
}

const deviceNotices = (devices: ReturnType<typeof useCallSession>['devices'], refusedSending: boolean) => [
  ...(devices?.blocked.microphone ? [text('noMicrophone')] : []),
  ...(devices?.blocked.camera ? [text('noCamera')] : []),
  ...(devices?.none ? [text('noDevices')] : []),
  ...(refusedSending ? [text('refused')] : []),
]

/**
 * A call, ready-made, that fills its parent, such as a column beside a conversation's messages: a check of the
 * microphone and camera first, then, after Join, everyone in the call with the one speaking ringed, a screen share
 * large, microphone, camera, screen share and Leave, the quality of each connection, Reconnecting while the link is
 * restored, and plain words for a full call, a blocked device or someone the browser cannot connect to. A member the app
 * lets invite also gets the call's guests: who waits in the lobby, and its guest links. Made for small peer-to-peer
 * calls, at a desktop's width or a phone's.
 */
export const CallView = ({ url, leave, nameOf = (member) => member, admission, name, className }: CallViewProps) => {
  const session = useCallSession(url, { ...(admission && { admission }) })
  const [guestsOpen, setGuestsOpen] = useState(false)
  const { basePath } = useRouter()
  const auth = useOptionalAuth()
  const user = auth?.state.kind === 'signed-in' ? auth.state.user : undefined
  const self = session.self ?? user?.id ?? ''
  const [now] = useState(() => Date.now())
  const { devices, phase } = session
  const own = { ...(devices?.microphone && { microphone: devices.microphone }), ...(devices?.camera && { camera: devices.camera }), ...(session.screen && { screen: session.screen.video }), microphoneOn: session.microphoneOn, cameraOn: session.cameraOn }
  const voices = new Map([...(devices?.microphone && session.microphoneOn ? [[self, devices.microphone] as const] : []), ...session.tracks.filter((track) => track.source === 'microphone' && track.track && !track.muted).map((track) => [track.member, track.track!] as const)])
  const speaker = useActiveSpeaker(phase.kind === 'in' ? voices : new Map())
  const notices = deviceNotices(devices, session.refusedSending)

  if (phase.kind === 'left') return <CallMessage reason={phase.reason} onJoinAgain={() => void session.join()} />
  if (phase.kind === 'waiting') return <CallWaiting leave={leave} />
  if (phase.kind === 'check') {
    return (
      <CallCheck
        name={name ?? user?.name ?? text('you')}
        {...(admission && { joinLabel: text('askToJoin') })}
        member={self}
        {...(devices?.camera && { camera: devices.camera })}
        microphoneOn={session.microphoneOn}
        cameraOn={session.cameraOn}
        microphone={Boolean(devices?.microphone)}
        cameraAvailable={Boolean(devices?.camera)}
        notices={notices}
        onMicrophone={session.toggleMicrophone}
        onCamera={session.toggleCamera}
        onJoin={() => void session.join()}
        cancel={leave}
      />
    )
  }
  const { lobby, guests } = session
  const inCall = session.members.filter((member) => member.member.startsWith('guest:')).map((member) => ({ guest: member.member.slice('guest:'.length), name: member.name ?? '' }))
  const people = callPeople({ members: session.members, self, tracks: session.tracks, own, nameOf, ...(speaker && { speaker }), connections: session.connections, seen: session.seen, now: Math.max(now, Date.now()) })
  return (
    <CallStage
      {...(className && { className })}
      people={people}
      state={phase.kind === 'joining' ? 'joining' : phase.resuming ? 'resuming' : 'joined'}
      notices={notices}
      {...(lobby && guests && { aside: <CallLobbyNotice waiting={lobby.guests} guests={guests} /> })}
      controls={{
        microphoneOn: session.microphoneOn && Boolean(devices?.microphone),
        cameraOn: session.cameraOn && Boolean(devices?.camera),
        sharing: Boolean(session.screen),
        onMicrophone: session.toggleMicrophone,
        onCamera: session.toggleCamera,
        ...(session.toggleScreen && { onShare: () => void session.toggleScreen!() }),
        ...(lobby && { guests: { waiting: lobby.guests.length, onOpen: () => setGuestsOpen(true) } }),
        leave,
      }}
    >
      {lobby && guests && <CallGuestsPanel lobby={lobby} inCall={inCall} guests={guests} linkOf={(token) => guestCallLink(`${window.location.origin}${basePath}`, token)} open={guestsOpen} onClose={() => setGuestsOpen(false)} />}
    </CallStage>
  )
}
