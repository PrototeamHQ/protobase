import type { CallCandidate, CallRemoteTrack, CallResume, CallServerMessage, CallTrackRequest, CallTrackSource, CallVideoLayer } from '@protobase/schema/internal'
import { createPeerConnection as newPeerConnection, type MediaLink, type MediaLinkInput, type PublishOptions } from './media-link'
import { negotiation } from './negotiation'

type LocalTrack = { source: CallTrackSource; track: MediaStreamTrack; transceiver: RTCRtpTransceiver; sid?: string; simulcast: boolean }

// Simulcast in a quarter, half and full size: what the media server forwards to each member depends on how they show it.
const simulcastLayers = [
  { rid: 'q', quality: 'low', scale: 4, maxBitrate: 150_000 },
  { rid: 'h', quality: 'medium', scale: 2, maxBitrate: 500_000 },
  { rid: 'f', quality: 'high', scale: 1, maxBitrate: 1_200_000 },
] as const
const singleBitrate = 1_200_000

const trackRequest = (source: CallTrackSource, track: MediaStreamTrack, simulcast: boolean): CallTrackRequest => {
  if (track.kind === 'audio') return { cid: track.id, kind: 'audio', source }
  const { width = 0, height = 0 } = track.getSettings()
  const layers: CallVideoLayer[] = simulcast
    ? simulcastLayers.map((layer) => ({ quality: layer.quality, width: Math.round(width / layer.scale), height: Math.round(height / layer.scale), bitrate: layer.maxBitrate }))
    : []
  return { cid: track.id, kind: 'video', source, width, height, ...(simulcast && { layers }) }
}

const sendEncodings = (track: MediaStreamTrack, simulcast: boolean): RTCRtpEncodingParameters[] | undefined => {
  if (track.kind === 'audio') return undefined
  if (!simulcast) return [{ maxBitrate: singleBitrate }]
  return simulcastLayers.map((layer) => ({ rid: layer.rid, scaleResolutionDownBy: layer.scale, maxBitrate: layer.maxBitrate }))
}

/**
 * The media link to a media server, over a single `RTCPeerConnection`: the browser always offers, one offer at a time,
 * and the server's answer maps each receiving section's `mid` to the track it carries. The link holds no media library;
 * everything it says goes through `send` to Protobase, which speaks to the media server.
 */
export const sfuLink = ({ iceServers, send, onTracks, onUnpublished, createPeerConnection = newPeerConnection }: MediaLinkInput): MediaLink => {
  const pc = createPeerConnection({ iceServers, bundlePolicy: 'max-bundle' })
  const local = new Map<CallTrackSource, LocalTrack>()
  // Candidates that arrive before the first answer wait for it.
  const early: CallCandidate[] = []
  let mids: Record<string, string> = {}
  let remote: CallRemoteTrack[] = []
  let offerId = 0
  let publishing: { resolve: (tracks: { cid: string; sid: string }[]) => void; reject: (error: Error) => void } | undefined
  let publishes: Promise<unknown> = Promise.resolve()

  const offers = negotiation(async () => {
    const offer = await pc.createOffer()
    await pc.setLocalDescription(offer)
    send({ type: 'offer', sdp: offer.sdp!, id: ++offerId })
  })
  // Chrome refuses an offer with nothing in it: a member who only listens waits for the server's `sections`. Messages
  // from the server only start an offer, since its answer is a later message.
  const offer = async () => {
    if (pc.getTransceivers().length > 0) await offers.request()
  }
  const negotiate = async () => {
    await offer()
    await offers.settled()
  }

  const receivedTrack = (sid: string) => {
    const mid = Object.keys(mids).find((key) => mids[key] === sid)
    return mid === undefined ? undefined : pc.getTransceivers().find((transceiver) => transceiver.mid === mid)?.receiver.track
  }
  const emitTracks = () => onTracks(remote.map((track) => ({ ...track, ...(receivedTrack(track.sid) && { track: receivedTrack(track.sid) }) })))

  pc.onicecandidate = (event) => {
    if (event.candidate) send({ type: 'candidate', candidate: event.candidate.toJSON() as CallCandidate })
  }
  // A path that failed, such as after a network change, gets new ICE credentials.
  pc.oniceconnectionstatechange = () => {
    if (pc.iceConnectionState === 'failed') void restartIce()
  }
  pc.ontrack = () => emitTracks()

  const restartIce = async () => {
    pc.restartIce()
    await negotiate()
  }

  const stopSending = (source: CallTrackSource) => {
    const sending = local.get(source)
    if (!sending) return false
    local.delete(source)
    if (pc.signalingState !== 'closed') pc.removeTrack(sending.transceiver.sender)
    return true
  }

  const receive = async (message: CallServerMessage) => {
    switch (message.type) {
      case 'answer': {
        if (message.id !== offerId) return
        mids = { ...mids, ...message.mids }
        await pc.setRemoteDescription({ type: 'answer', sdp: message.sdp })
        for (const candidate of early.splice(0)) await pc.addIceCandidate(candidate)
        emitTracks()
        await offers.answered()
        return
      }
      case 'candidate':
        if (pc.remoteDescription) await pc.addIceCandidate(message.candidate)
        else early.push(message.candidate)
        return
      case 'sections':
        for (let i = 0; i < message.audio; i++) pc.addTransceiver('audio', { direction: 'recvonly' })
        for (let i = 0; i < message.video; i++) pc.addTransceiver('video', { direction: 'recvonly' })
        await offer()
        return
      case 'tracks':
        remote = message.tracks
        emitTracks()
        return
      case 'unpublished': {
        const sending = [...local.values()].find((track) => track.sid === message.sid)
        if (!sending) return
        stopSending(sending.source)
        await offer()
        onUnpublished(sending.source)
        return
      }
      case 'published':
        publishing?.resolve(message.tracks)
        return
      case 'publish-refused':
        publishing?.reject(new Error(message.reason))
        return
    }
  }

  const publishNow = async (tracks: Partial<Record<CallTrackSource, MediaStreamTrack>>, options: PublishOptions) => {
    const added = (Object.entries(tracks) as [CallTrackSource, MediaStreamTrack][]).map(([source, track]) => {
      if (local.has(source)) throw new Error(`The call already sends a ${source} track: unpublish it first`)
      const simulcast = track.kind === 'video' && Boolean(options.simulcast)
      const encodings = sendEncodings(track, simulcast)
      const transceiver = pc.addTransceiver(track, { direction: 'sendonly', ...(encodings && { sendEncodings: encodings }) })
      return { source, track, transceiver, simulcast } satisfies LocalTrack
    })
    if (added.length === 0) return
    const answered = new Promise<{ cid: string; sid: string }[]>((resolve, reject) => (publishing = { resolve, reject }))
    send({ type: 'publish', tracks: added.map((track) => trackRequest(track.source, track.track, track.simulcast)) })
    try {
      const sids = await answered
      for (const track of added) local.set(track.source, { ...track, sid: sids.find((sid) => sid.cid === track.track.id)!.sid })
    } catch (error) {
      for (const track of added) track.transceiver.stop()
      throw error
    } finally {
      publishing = undefined
    }
    await negotiate()
  }

  return {
    receive,
    /** Sends the tracks, under the sources they carry; rejects when the member may not send them. One publish at a time. */
    publish: (tracks: Partial<Record<CallTrackSource, MediaStreamTrack>>, options: PublishOptions = {}) => {
      const next = publishes.then(() => publishNow(tracks, options))
      publishes = next.catch(() => {})
      return next
    },
    /** Stops sending the source's track; the track itself goes on until the app stops it. */
    unpublish: async (source: CallTrackSource) => {
      if (stopSending(source)) await negotiate()
    },
    mute: (source: CallTrackSource, muted: boolean) => {
      const sending = local.get(source)
      if (!sending?.sid) return
      sending.track.enabled = !muted
      send({ type: 'mute', sid: sending.sid, muted })
    },
    restartIce,
    /** What a new server session needs to resume this link, after an offer still in flight is taken back. */
    resumeState: async (participant: string): Promise<CallResume | undefined> => {
      if (pc.signalingState === 'have-local-offer') {
        await pc.setLocalDescription({ type: 'rollback' })
        offers.abandon()
      }
      if (!pc.localDescription || !pc.remoteDescription) return undefined
      const tracks = [...local.values()].flatMap((track) => (track.sid ? [{ cid: track.track.id, sid: track.sid, kind: track.track.kind as 'audio' | 'video', source: track.source }] : []))
      return { participant, offer: pc.localDescription.sdp, answer: pc.remoteDescription.sdp, tracks }
    },
    /** After a resume: offers what changed while the session was lost. */
    resumed: async () => {
      if (offers.pending) await offer()
    },
    /** The tracks the member sends, by source, to publish again after a rejoin. */
    sending: () => new Map([...local.values()].map((track) => [track.source, { track: track.track, simulcast: track.simulcast }])),
    close: () => {
      publishing?.reject(new Error('The call ended'))
      offers.reset()
      pc.close()
    },
  }
}
