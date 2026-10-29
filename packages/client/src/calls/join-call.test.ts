import { describe, expect, it, vi } from 'vitest'
import type { CallServerMessage } from '@protobase/schema/internal'
import { joinCall, type CallState, type JoinCallOptions } from './join-call'

// Sockets the call opens, which the test answers as the server would.
const fakeSockets = () => {
  const opened: FakeSocket[] = []
  class FakeSocket {
    static OPEN = 1
    static CONNECTING = 0
    /** Off, a new socket never opens, as one to a server that is not up. */
    static reachable = true
    readyState = 0
    sent: unknown[] = []
    onopen?: () => void
    onmessage?: (event: { data: string }) => void
    onclose?: (event: { code: number }) => void
    constructor(readonly url: string) {
      opened.push(this)
      if (!FakeSocket.reachable) return
      queueMicrotask(() => {
        this.readyState = 1
        this.onopen?.()
      })
    }
    send(data: string) {
      this.sent.push(JSON.parse(data))
    }
    close() {
      this.readyState = 3
    }
    receive(message: CallServerMessage) {
      this.onmessage?.({ data: JSON.stringify(message) })
    }
    drop(code: number) {
      this.readyState = 3
      this.onclose?.({ code })
    }
  }
  return { opened, WebSocket: FakeSocket as unknown as typeof WebSocket, reachable: (reachable: boolean) => (FakeSocket.reachable = reachable) }
}

// A peer connection that has agreed on descriptions and never offers.
const fakePeerConnection = () =>
  ({ getTransceivers: () => [], signalingState: 'stable', localDescription: { sdp: 'v=0 offer' }, remoteDescription: { sdp: 'v=0 answer' }, close: vi.fn() }) as unknown as RTCPeerConnection

const start = (more: Partial<JoinCallOptions> = {}) => {
  const { opened, WebSocket, reachable } = fakeSockets()
  const states: CallState[] = []
  const call = joinCall({ url: 'https://app.example.com/api/functions/meeting?call=1', WebSocket, createPeerConnection: fakePeerConnection, onState: (state) => void states.push(state), retryDelayMs: () => 0, ...more })
  return { opened, states, call, reachable }
}

describe('joining a call', () => {
  it('joins over the function socket and resolves once joined', async () => {
    const { opened, call, states } = start()
    await vi.waitFor(() => expect(opened[0]?.sent).toEqual([{ type: 'join' }]))
    expect(opened[0]!.url).toBe('wss://app.example.com/api/functions/meeting?call=1')
    opened[0]!.receive({ type: 'joined', call: '7', mode: 'sfu', participant: 'PA_ann', iceServers: [] })
    expect((await call).participant).toBe('PA_ann')
    expect(states).toEqual([{ state: 'connecting' }, { state: 'joined' }])
  })

  it('resumes on a new socket with the browser\'s state after a lost one', async () => {
    const { opened, call, states } = start()
    await vi.waitFor(() => expect(opened[0]?.sent).toHaveLength(1))
    opened[0]!.receive({ type: 'joined', call: '7', mode: 'sfu', participant: 'PA_ann', iceServers: [] })
    await call
    opened[0]!.drop(1012)
    await vi.waitFor(() => expect(opened[1]?.sent).toEqual([{ type: 'resume', call: '7', participant: 'PA_ann', offer: 'v=0 offer', answer: 'v=0 answer', tracks: [] }]))
    opened[1]!.receive({ type: 'resumed' })
    await vi.waitFor(() => expect(states.map((state) => state.state)).toEqual(['connecting', 'joined', 'resuming', 'joined']))
  })

  it('tries a resume again when it reached no server', async () => {
    const { opened, call, reachable } = start()
    await vi.waitFor(() => expect(opened[0]?.sent).toHaveLength(1))
    opened[0]!.receive({ type: 'joined', call: '7', mode: 'sfu', participant: 'PA_ann', iceServers: [] })
    await call
    reachable(false)
    opened[0]!.drop(1012)
    await vi.waitFor(() => expect(opened).toHaveLength(2))
    reachable(true)
    opened[1]!.drop(1006)
    await vi.waitFor(() => expect(opened[2]?.sent).toEqual([expect.objectContaining({ type: 'resume' })]))
  })

  it('joins anew when a resume was not taken', async () => {
    const { opened, call } = start()
    await vi.waitFor(() => expect(opened[0]?.sent).toHaveLength(1))
    opened[0]!.receive({ type: 'joined', call: '7', mode: 'sfu', participant: 'PA_ann', iceServers: [] })
    await call
    opened[0]!.drop(1012)
    await vi.waitFor(() => expect(opened[1]?.sent).toHaveLength(1))
    opened[1]!.drop(4000)
    await vi.waitFor(() => expect(opened[2]?.sent).toEqual([{ type: 'join' }]))
  })

  it('leaves the call when the app refuses the member, and rejects a join it refused', async () => {
    const joined = start()
    await vi.waitFor(() => expect(joined.opened[0]?.sent).toHaveLength(1))
    joined.opened[0]!.receive({ type: 'joined', call: '7', mode: 'sfu', participant: 'PA_ann', iceServers: [] })
    await joined.call
    joined.opened[0]!.drop(1008)
    await vi.waitFor(() => expect(joined.states.at(-1)).toEqual({ state: 'left', reason: 'removed' }))

    const refused = start()
    await vi.waitFor(() => expect(refused.opened).toHaveLength(1))
    refused.opened[0]!.drop(1006)
    await expect(refused.call).rejects.toThrow('The call was left: refused')
  })

  it('knows its call and who is in it, the member too', async () => {
    const onMembers = vi.fn()
    const { opened, call } = start({ onMembers })
    await vi.waitFor(() => expect(opened[0]?.sent).toHaveLength(1))
    opened[0]!.receive({ type: 'joined', call: '7', mode: 'peer', participant: 'ann', iceServers: [] })
    const joined = await call
    const members = [{ member: 'ann', joined_at: '2026-10-29T10:00:00.000Z' }, { member: 'bob', joined_at: '2026-10-29T10:00:01.000Z' }]
    opened[0]!.receive({ type: 'members', members })
    await vi.waitFor(() => expect(onMembers).toHaveBeenCalledWith(members))
    expect(joined.id).toBe('7')
    expect(joined.members()).toEqual(members)
  })

  it('leaves with the reason the server refused the member for, such as a full call', async () => {
    const { opened, call, states } = start()
    await vi.waitFor(() => expect(opened[0]?.sent).toHaveLength(1))
    opened[0]!.receive({ type: 'left', reason: 'full' })
    opened[0]!.drop(1008)
    await expect(call).rejects.toThrow('The call was left: full')
    expect(states.at(-1)).toEqual({ state: 'left', reason: 'full' })
  })

  it('tries to get in again while the server fails, then leaves as unavailable', async () => {
    const { opened, call, states } = start({ maxRetries: 2 })
    for (const index of [0, 1, 2]) {
      await vi.waitFor(() => expect(opened[index]?.sent).toEqual([{ type: 'join' }]))
      opened[index]!.drop(1011)
    }
    await expect(call).rejects.toThrow('The call was left: unavailable')
    expect(states.map((state) => state.state)).toEqual(['connecting', 'connecting', 'connecting', 'left'])
  })
})
