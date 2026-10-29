import { describe, expect, it } from 'vitest'
import type { CallClientMessage } from '@protobase/schema/internal'
import { peerLink } from './peer-link'

const description = (type: RTCSdpType, sdp: string) => ({ type, sdp, toJSON: () => ({ type, sdp }) })

// A peer connection that only keeps the signaling state, as the browser would, and rolls back an offer it set when the
// other side's comes.
class FakeConnection {
  signalingState: RTCSignalingState = 'stable'
  localDescription: ReturnType<typeof description> | null = null
  remoteDescription: RTCSessionDescriptionInit | null = null
  currentRemoteDescription: RTCSessionDescriptionInit | null = null
  onnegotiationneeded?: () => Promise<void>
  onicecandidate?: (event: { candidate: { toJSON: () => RTCIceCandidateInit } }) => void
  remoteOffers = 0
  async setLocalDescription() {
    if (this.signalingState === 'have-remote-offer') {
      this.localDescription = description('answer', 'answer')
      this.currentRemoteDescription = this.remoteDescription
      this.signalingState = 'stable'
      return
    }
    this.localDescription = description('offer', 'offer')
    this.signalingState = 'have-local-offer'
  }
  async setRemoteDescription(remote: RTCSessionDescriptionInit) {
    this.remoteDescription = remote
    if (remote.type === 'offer') {
      this.remoteOffers++
      this.signalingState = 'have-remote-offer'
      return
    }
    this.currentRemoteDescription = remote
    this.signalingState = 'stable'
  }
  async addIceCandidate() {}
  getTransceivers() {
    return []
  }
  close() {
    this.signalingState = 'closed'
  }
}

// Ann, whose id sorts first, gives way to Bob when their offers cross.
const annAndBob = async () => {
  const connections: FakeConnection[] = []
  const sent: CallClientMessage[] = []
  const link = peerLink('ann', {
    iceServers: [],
    send: (message) => sent.push(message),
    onTracks: () => {},
    onUnpublished: () => {},
    createPeerConnection: () => {
      connections.push(new FakeConnection())
      return connections.at(-1) as unknown as RTCPeerConnection
    },
  })
  await link.receive({ type: 'peers', members: ['bob'] })
  const offerFromBob = (sdp = 'bob') => link.receive({ type: 'signal', from: 'bob', description: { type: 'offer', sdp } })
  return { connections, sent, offerFromBob }
}

describe('the peer link', () => {
  it('answers a crossing offer on a new connection when the one it gave way on was never negotiated', async () => {
    const { connections, sent, offerFromBob } = await annAndBob()
    void connections[0]!.onnegotiationneeded!()
    await offerFromBob()
    expect(connections.map((connection) => connection.signalingState)).toEqual(['closed', 'stable'])
    expect(connections[1]!.remoteOffers).toBe(1)
    expect(sent.at(-1)).toEqual({ type: 'signal', to: 'bob', description: { type: 'answer', sdp: 'answer' } })
    // A candidate the closed connection still gathers is never sent.
    const before = sent.length
    connections[0]!.onicecandidate!({ candidate: { toJSON: () => ({ candidate: 'old' }) } })
    expect(sent).toHaveLength(before)
  })

  it('rolls back on the same connection once it was negotiated', async () => {
    const { connections, offerFromBob } = await annAndBob()
    await offerFromBob()
    await connections[0]!.onnegotiationneeded!()
    await offerFromBob()
    expect(connections).toHaveLength(1)
    expect(connections[0]!.remoteOffers).toBe(2)
  })

  it("keeps its own offer when Firefox's crosses it, since Firefox gives way to Chromium", async () => {
    const { connections, offerFromBob } = await annAndBob()
    await connections[0]!.onnegotiationneeded!()
    await offerFromBob('v=0\no=mozilla...THIS_IS_SDPARTA 0 0 IN IP4 0.0.0.0')
    expect(connections).toHaveLength(1)
    expect(connections[0]!.signalingState).toBe('have-local-offer')
    expect(connections[0]!.remoteOffers).toBe(0)
  })
})
