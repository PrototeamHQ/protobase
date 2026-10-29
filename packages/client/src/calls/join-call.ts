import type { CallClientMessage, CallLeftReason, CallRosterMember, CallServerMessage, CallTrackSource } from '@protobase/schema/internal'
import type { CallTrack, MediaLink, MediaLinkInput, PublishOptions } from './media-link'
import { peerLink } from './peer-link'
import { sfuLink } from './sfu-link'

/** Where a call stands: `resuming` while the link to Protobase is restored, with media still flowing. */
export type CallState = { state: 'connecting' } | { state: 'joined' } | { state: 'resuming' } | { state: 'left'; reason: CallLeftReason; error?: unknown }

export type JoinCallOptions = {
  /**
   * The socket of the app's function that admits the member, such as `/api/functions/meeting?call=42`: a path on the
   * page's origin, or an absolute `http(s)` or `ws(s)` URL. The browser sends its session cookie with it.
   */
  url: string
  /** Every track of other members the member hears, whenever one comes, goes or its media arrives. */
  onTracks?: (tracks: CallTrack[]) => void
  /** Everyone in the call, the member too, in the order they came, whenever that changes. */
  onMembers?: (members: CallRosterMember[]) => void
  /** Who speaks how loudly, from 0 to 1, for the members whose level changed. */
  onSpeakers?: (speakers: { member: string; level: number }[]) => void
  onState?: (state: CallState) => void
  /** The media server stopped one of the member's own tracks, such as after a demotion. */
  onUnpublished?: (source: CallTrackSource) => void
  /** How long to wait before the `attempt`th try to restore a lost link. */
  retryDelayMs?: (attempt: number) => number
  /** How many tries in a row to restore a lost link, or to get in while the server fails, before the call is left. Default 8. */
  maxRetries?: number
  WebSocket?: typeof WebSocket
  createPeerConnection?: (configuration: RTCConfiguration) => RTCPeerConnection
}

export type Call = {
  /** The call, as the record's calls list it and `calls.remove` takes it. */
  readonly id: string
  /** The member's participant in the media server. */
  readonly participant: string
  /** Everyone in the call now, the member too. */
  members: () => CallRosterMember[]
  /** Sends tracks under the sources they carry, such as `{ camera, microphone }`; rejects when the member may not. */
  publish: (tracks: Partial<Record<CallTrackSource, MediaStreamTrack>>, options?: PublishOptions) => Promise<void>
  unpublish: (source: CallTrackSource) => Promise<void>
  mute: (source: CallTrackSource, muted: boolean) => void
  /** How large remote video tracks are shown, so the media server sends a layer that fits, or `hidden` for none. */
  view: (sids: string[], size: { width: number; height: number } | 'hidden') => void
  /** New ICE credentials, such as after a network change; a failed connection restarts by itself. */
  restartIce: () => Promise<void>
  leave: () => void
  /** The tracks of other members the member hears now. */
  tracks: () => CallTrack[]
}

const backoff = (attempt: number) => Math.min(10_000, 500 * 2 ** attempt)

const socketUrl = (url: string) => {
  const resolved = new URL(url, globalThis.location?.href)
  resolved.protocol = resolved.protocol.replace(/^http/, 'ws')
  return resolved.href
}

/** Close codes after which the member is out of the call: left, or refused by the app. */
const leftCodes: Record<number, CallLeftReason> = { 1000: 'ended', 1008: 'removed' }
/** Close codes of a server that failed, or was too busy, for now: getting in is tried again. */
const failedCodes = new Set([1011, 1013])

/**
 * Joins a call through the app's function socket and resolves once the member is in it. Media flows over plain
 * `RTCPeerConnection`s, to the media server or straight to the other members, as the app's calls are configured;
 * Protobase relays their offers and answers and decides who is in the call and who hears whom. A lost socket, such as during a deploy, is restored with the browser's own state while
 * media keeps flowing; when the media server no longer knows the member, the call is joined again with the same tracks.
 */
export const joinCall = (options: JoinCallOptions): Promise<Call> => {
  const WebSocketOf = options.WebSocket ?? WebSocket
  const retryDelay = options.retryDelayMs ?? backoff
  const maxRetries = options.maxRetries ?? 8
  const url = socketUrl(options.url)

  let socket: WebSocket
  let link: MediaLink | undefined
  let participant = ''
  let callId = ''
  let members: CallRosterMember[] = []
  let remote: CallTrack[] = []
  let ended = false
  let rejoin = false
  // Whether the socket reached the server, and whether the server took the resume it sent.
  let opened = false
  let resumedSinceOpen = false
  let failures = 0
  let chain: Promise<void> = Promise.resolve()
  let joined: { resolve: (call: Call) => void; reject: (error: unknown) => void }
  const result = new Promise<Call>((resolve, reject) => (joined = { resolve, reject }))

  const send = (message: CallClientMessage) => {
    if (socket.readyState === WebSocketOf.OPEN) socket.send(JSON.stringify(message))
  }
  const setState = (state: CallState) => options.onState?.(state)

  const end = (reason: CallLeftReason, error?: unknown) => {
    if (ended) return
    ended = true
    link?.close()
    link = undefined
    if (socket.readyState === WebSocketOf.OPEN || socket.readyState === WebSocketOf.CONNECTING) socket.close(1000)
    joined.reject(error ?? new Error(`The call was left: ${reason}`))
    setState({ state: 'left', reason, ...(error !== undefined && { error }) })
  }

  // The link the call's mode needs: to a media server, or to each other member.
  const newLink = (joined: Extract<CallServerMessage, { type: 'joined' }>) => {
    const input: MediaLinkInput = {
      iceServers: joined.iceServers,
      send,
      onTracks: (tracks) => {
        remote = tracks
        options.onTracks?.(tracks)
      },
      onUnpublished: (source) => options.onUnpublished?.(source),
      ...(options.createPeerConnection && { createPeerConnection: options.createPeerConnection }),
    }
    return joined.mode === 'peer' ? peerLink(joined.participant, input) : sfuLink(input)
  }

  const handle = async (message: CallServerMessage) => {
    switch (message.type) {
      case 'joined': {
        const before = link?.sending()
        link?.close()
        participant = message.participant
        callId = message.call
        link = newLink(message)
        failures = 0
        setState({ state: 'joined' })
        joined.resolve(call)
        // A rejoin sends the same tracks again, outside the message chain, since its answer is a later message.
        for (const [source, { track, simulcast }] of before ?? []) void call.publish({ [source]: track }, { simulcast }).catch((error: unknown) => end('ended', error))
        return
      }
      case 'resumed':
        resumedSinceOpen = true
        failures = 0
        setState({ state: 'joined' })
        await link?.resumed()
        return
      case 'speakers':
        options.onSpeakers?.(message.speakers)
        return
      case 'members':
        members = message.members
        options.onMembers?.(members)
        return
      case 'left':
        if (message.reason === 'rejoin') rejoin = true
        else end(message.reason)
        return
      default:
        await link?.receive(message)
    }
  }

  const connect = (mode: 'join' | 'resume') => {
    opened = false
    resumedSinceOpen = false
    socket = new WebSocketOf(url)
    socket.onopen = () => {
      opened = true
      chain = chain.then(async () => {
        const resume = mode === 'resume' && link ? await link.resumeState(participant) : undefined
        send(resume ? { type: 'resume', call: callId, ...resume } : { type: 'join' })
      })
    }
    socket.onmessage = (event) => {
      const message = JSON.parse(String(event.data)) as CallServerMessage
      chain = chain.then(() => handle(message)).catch((error: unknown) => end('ended', error))
    }
    socket.onclose = (event) => {
      chain = chain.then(() => closed(mode, event.code))
    }
  }

  const closed = (mode: 'join' | 'resume', code: number) => {
    if (ended) return
    if (rejoin) {
      rejoin = false
      return connect('join')
    }
    const left = leftCodes[code]
    if (left) return end(left)
    if (!participant && !failedCodes.has(code)) return end('refused')
    failures++
    if (failures > maxRetries) return end(participant ? 'ended' : 'unavailable')
    setState(participant ? { state: 'resuming' } : { state: 'connecting' })
    // A resume the server got but did not take is not tried again: the member joins anew with the same tracks. One that
    // never reached a server, such as during a deploy, is tried again.
    const next = mode === 'resume' && opened && !resumedSinceOpen ? 'join' : 'resume'
    setTimeout(() => {
      if (!ended) connect(next)
    }, retryDelay(failures - 1))
  }

  const call: Call = {
    get id() {
      return callId
    },
    get participant() {
      return participant
    },
    members: () => members,
    publish: async (tracks, publishOptions) => {
      if (!link) throw new Error('The call was left')
      await link.publish(tracks, publishOptions)
    },
    unpublish: async (source) => {
      await link?.unpublish(source)
    },
    mute: (source, muted) => link?.mute(source, muted),
    view: (sids, size) => send(size === 'hidden' ? { type: 'view', sids, width: 0, height: 0, hidden: true } : { type: 'view', sids, ...size }),
    restartIce: async () => {
      await link?.restartIce()
    },
    leave: () => {
      if (ended) return
      send({ type: 'leave' })
      end('ended')
    },
    tracks: () => remote,
  }

  setState({ state: 'connecting' })
  connect('join')
  return result
}
