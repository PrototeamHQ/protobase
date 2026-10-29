import { useCallback, useEffect, useRef, useState } from 'react'
import type { Call, CallConnection, CallLeftReason, CallRosterMember, CallTrack } from '@protobase/client/calls'
import { openDevices, type Devices } from './devices'

/** Where the member stands: checking their devices, joining, in the call (`resuming` while its link is restored), or out of it. */
export type CallPhase = { kind: 'check' } | { kind: 'joining' } | { kind: 'in'; resuming: boolean } | { kind: 'left'; reason: CallLeftReason }

// How often the connections' state and quality are read while in the call.
const connectionsEveryMs = 2000

const stop = (tracks: readonly (MediaStreamTrack | undefined)[]) => {
  for (const track of tracks) track?.stop()
}

/**
 * The member's session in the call the app's function at `url` admits them to: their devices from the start, for the
 * check before joining; then the call, which `join` joins after the click, with what they send and receive, and who
 * is in it. Leaving the page leaves the call and stops the devices.
 */
export const useCallSession = (url: string) => {
  const [phase, setPhase] = useState<CallPhase>({ kind: 'check' })
  const [devices, setDevices] = useState<Devices>()
  const [microphoneOn, setMicrophoneOn] = useState(true)
  const [cameraOn, setCameraOn] = useState(true)
  const [tracks, setTracks] = useState<CallTrack[]>([])
  const [members, setMembers] = useState<CallRosterMember[]>([])
  const [connections, setConnections] = useState<CallConnection[]>([])
  const [screen, setScreen] = useState<{ video: MediaStreamTrack; audio?: MediaStreamTrack }>()
  const [refusedSending, setRefusedSending] = useState(false)
  const call = useRef<Call | undefined>(undefined)
  const gone = useRef(false)
  const own = useRef<(MediaStreamTrack | undefined)[]>([])
  const seen = useRef(new Map<string, number>())

  useEffect(() => {
    gone.current = false
    void openDevices().then((opened) => {
      if (gone.current) return stop([opened.microphone, opened.camera])
      own.current.push(opened.microphone, opened.camera)
      setDevices(opened)
    })
    return () => {
      gone.current = true
      call.current?.leave()
      call.current = undefined
      stop(own.current)
      own.current = []
    }
  }, [])

  useEffect(() => {
    for (const { member } of members) if (!seen.current.has(member)) seen.current.set(member, Date.now())
  }, [members])

  useEffect(() => {
    if (phase.kind !== 'in') return
    const timer = setInterval(() => void call.current?.connections().then(setConnections), connectionsEveryMs)
    return () => clearInterval(timer)
  }, [phase.kind])

  const join = useCallback(async () => {
    setPhase({ kind: 'joining' })
    const { joinCall, PublishRefused } = await import('@protobase/client/calls')
    const joined = await joinCall({
      url,
      onTracks: setTracks,
      onMembers: setMembers,
      onState: (state) => {
        if (state.state === 'joined' || state.state === 'resuming') setPhase({ kind: 'in', resuming: state.state === 'resuming' })
        if (state.state === 'left') setPhase({ kind: 'left', reason: state.reason })
      },
    }).then(
      (made) => made,
      // A join that failed is left, and `onState` said why.
      () => undefined,
    )
    if (!joined) return
    if (gone.current) return joined.leave()
    call.current = joined
    const sending = { ...(devices?.microphone && { microphone: devices.microphone }), ...(devices?.camera && { camera: devices.camera }) }
    await joined.publish(sending).then(
      () => {
        if (sending.microphone) joined.mute('microphone', !microphoneOn)
        if (sending.camera) joined.mute('camera', !cameraOn)
      },
      (error: unknown) => {
        if (!(error instanceof PublishRefused)) throw error
        setRefusedSending(true)
      },
    )
  }, [url, devices, microphoneOn, cameraOn])

  const toggleMicrophone = useCallback(() => {
    const next = !microphoneOn
    setMicrophoneOn(next)
    if (devices?.microphone) devices.microphone.enabled = next
    call.current?.mute('microphone', !next)
  }, [microphoneOn, devices])

  const toggleCamera = useCallback(() => {
    const next = !cameraOn
    setCameraOn(next)
    if (devices?.camera) devices.camera.enabled = next
    call.current?.mute('camera', !next)
  }, [cameraOn, devices])

  const stopSharing = useCallback(async (shared: { video: MediaStreamTrack; audio?: MediaStreamTrack }) => {
    setScreen(undefined)
    stop([shared.video, shared.audio])
    await call.current?.unpublish('screen')
    if (shared.audio) await call.current?.unpublish('screen-audio')
  }, [])

  const toggleScreen = useCallback(async () => {
    if (screen) return stopSharing(screen)
    let display: MediaStream
    try {
      display = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true })
    } catch (error) {
      // The person closed the browser's picker without sharing.
      if (error instanceof DOMException && error.name === 'NotAllowedError') return
      throw error
    }
    const shared = { video: display.getVideoTracks()[0]!, ...(display.getAudioTracks()[0] && { audio: display.getAudioTracks()[0] }) }
    own.current.push(shared.video, shared.audio)
    shared.video.addEventListener('ended', () => void stopSharing(shared))
    await call.current?.publish({ screen: shared.video, ...(shared.audio && { 'screen-audio': shared.audio }) })
    setScreen(shared)
  }, [screen, stopSharing])

  const canShare = typeof navigator !== 'undefined' && typeof navigator.mediaDevices?.getDisplayMedia === 'function'

  return {
    phase,
    devices,
    microphoneOn,
    cameraOn,
    tracks,
    members,
    connections,
    screen,
    refusedSending,
    seen: seen.current,
    self: call.current?.participant,
    join,
    toggleMicrophone,
    toggleCamera,
    ...(canShare && { toggleScreen }),
  }
}
