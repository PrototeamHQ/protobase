import { PublishRefused } from './publish-refused'
import type { CallCandidate, CallDescription, CallRemoteTrack, CallServerMessage, CallTrackSource } from '@protobase/schema/internal'
import { createPeerConnection as newPeerConnection, type MediaLink, type MediaLinkInput } from './media-link'
import { connectionOf } from './connection-stats'
import { midsByStreamId } from './msid-tracks'

type Peer = { pc: RTCPeerConnection; polite: boolean; makingOffer: boolean; ignoreOffer: boolean; senders: Map<CallTrackSource, RTCRtpSender> }
// Each sent track on a stream of its own, whose id names it: the receiving browser reads it in the description's msid.
type LocalTrack = { track: MediaStreamTrack; sid: string; stream: MediaStream }

/**
 * The media link without a media server: one `RTCPeerConnection` to each other member, whose browser answers, so either
 * side may offer. Protobase passes the descriptions and candidates between the two ("perfect negotiation": the member
 * whose id sorts first gives way when both offer at once) and says who is in the call and which tracks each member
 * hears. A track goes by the id of the stream the sending browser sends it on, which the receiving browser sees too.
 */
export const peerLink = (self: string, { iceServers, send, onTracks, createPeerConnection = newPeerConnection }: MediaLinkInput): MediaLink => {
  const peers = new Map<string, Peer>()
  const local = new Map<CallTrackSource, LocalTrack>()
  let remote: CallRemoteTrack[] = []
  let publishing: { resolve: () => void; reject: (error: Error) => void } | undefined
  let publishes: Promise<unknown> = Promise.resolve()

  // Each sent track on a transceiver of its own: one the other side's offer made would keep that offer's msid, and the
  // other browser could not tell which track it carries.
  const sendOn = (pc: RTCPeerConnection, { track, stream }: LocalTrack) => pc.addTransceiver(track, { direction: 'sendonly', streams: [stream] }).sender

  const receivedTrack = ({ member, sid }: CallRemoteTrack) => {
    const pc = peers.get(member)?.pc
    const mid = pc?.remoteDescription && midsByStreamId(pc.remoteDescription.sdp).get(sid)
    return mid === undefined ? undefined : pc!.getTransceivers().find((transceiver) => transceiver.mid === mid)?.receiver.track
  }
  const emitTracks = () => onTracks(remote.map((track) => ({ ...track, ...(receivedTrack(track) && { track: receivedTrack(track) }) })))

  const connect = (member: string) => {
    const pc = createPeerConnection({ iceServers })
    const peer: Peer = { pc, polite: self < member, makingOffer: false, ignoreOffer: false, senders: new Map() }
    peers.set(member, peer)
    pc.onnegotiationneeded = async () => {
      peer.makingOffer = true
      try {
        await pc.setLocalDescription()
        send({ type: 'signal', to: member, description: pc.localDescription!.toJSON() as CallDescription })
      } finally {
        peer.makingOffer = false
      }
    }
    pc.onicecandidate = (event) => {
      if (event.candidate) send({ type: 'signal', to: member, candidate: event.candidate.toJSON() as CallCandidate })
    }
    pc.oniceconnectionstatechange = () => {
      if (pc.iceConnectionState === 'failed') pc.restartIce()
    }
    pc.ontrack = () => emitTracks()
    for (const [source, sending] of local) peer.senders.set(source, sendOn(pc, sending))
    return peer
  }
  const disconnect = (member: string) => {
    peers.get(member)?.pc.close()
    peers.delete(member)
  }

  const signal = async (from: string, description?: CallDescription, candidate?: CallCandidate) => {
    // The other member may reach this browser before the list that names them does.
    const peer = peers.get(from) ?? connect(from)
    const { pc } = peer
    if (description) {
      const collision = description.type === 'offer' && (peer.makingOffer || pc.signalingState !== 'stable')
      peer.ignoreOffer = !peer.polite && collision
      if (peer.ignoreOffer) return
      await pc.setRemoteDescription(description)
      if (description.type === 'offer') {
        await pc.setLocalDescription()
        send({ type: 'signal', to: from, description: pc.localDescription!.toJSON() as CallDescription })
      }
      emitTracks()
    }
    // A candidate of an offer this side gave way on belongs to nothing here.
    if (candidate) {
      await pc.addIceCandidate(candidate).catch((error: unknown) => {
        if (!peer.ignoreOffer) throw error
      })
    }
  }

  const receive = async (message: CallServerMessage) => {
    switch (message.type) {
      case 'peers': {
        const present = new Set(message.members)
        for (const member of peers.keys()) if (!present.has(member)) disconnect(member)
        for (const member of present) if (!peers.has(member)) connect(member)
        return
      }
      case 'signal':
        return signal(message.from, message.description, message.candidate)
      case 'tracks':
        remote = message.tracks
        emitTracks()
        return
      case 'published':
        publishing?.resolve()
        return
      case 'publish-refused':
        publishing?.reject(new PublishRefused(message.reason))
        return
    }
  }

  const publishNow = async (tracks: Partial<Record<CallTrackSource, MediaStreamTrack>>) => {
    const added = Object.entries(tracks) as [CallTrackSource, MediaStreamTrack][]
    for (const [source] of added) if (local.has(source)) throw new Error(`The call already sends a ${source} track: unpublish it first`)
    if (added.length === 0) return
    const sending = added.map(([source, track]): [CallTrackSource, LocalTrack] => {
      const stream = new MediaStream([track])
      return [source, { track, sid: stream.id, stream }]
    })
    const answered = new Promise<void>((resolve, reject) => (publishing = { resolve, reject }))
    send({ type: 'publish', tracks: sending.map(([source, { track, sid }]) => ({ cid: sid, kind: track.kind as 'audio' | 'video', source })) })
    try {
      await answered
    } finally {
      publishing = undefined
    }
    for (const [source, track] of sending) {
      local.set(source, track)
      for (const peer of peers.values()) peer.senders.set(source, sendOn(peer.pc, track))
    }
  }

  return {
    receive,
    publish: (tracks) => {
      const next = publishes.then(() => publishNow(tracks))
      publishes = next.catch(() => {})
      return next
    },
    unpublish: async (source) => {
      const sending = local.get(source)
      if (!sending) return
      local.delete(source)
      for (const peer of peers.values()) {
        const sender = peer.senders.get(source)
        if (sender && peer.pc.signalingState !== 'closed') peer.pc.removeTrack(sender)
        peer.senders.delete(source)
      }
      send({ type: 'unpublish', sid: sending.sid })
    },
    mute: (source, muted) => {
      const sending = local.get(source)
      if (!sending) return
      sending.track.enabled = !muted
      send({ type: 'mute', sid: sending.sid, muted })
    },
    restartIce: async () => {
      for (const peer of peers.values()) peer.pc.restartIce()
    },
    // The browsers' connections outlast the server's session: a new one only needs the member's tracks.
    resumeState: async (participant) => ({
      participant,
      tracks: [...local].map(([source, { track, sid }]) => ({ cid: sid, sid, kind: track.kind as 'audio' | 'video', source })),
    }),
    resumed: async () => {},
    sending: () => new Map([...local].map(([source, { track }]) => [source, { track, simulcast: false }])),
    connections: () => Promise.all([...peers].map(([member, peer]) => connectionOf(peer.pc, member))),
    close: () => {
      publishing?.reject(new Error('The call ended'))
      for (const member of [...peers.keys()]) disconnect(member)
    },
  }
}
