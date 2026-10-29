import { afterEach, describe, expect, it, vi } from 'vitest'
import type { CallServerMessage } from '@protobase/schema/internal'
import type { CallMember } from '../call-member'
import { peerBackend } from './peer-backend'

afterEach(() => void vi.useRealTimers())

// Members of one peer plugin, each with what their browser was sent.
const plugin = () => {
  const backend = peerBackend({ kind: 'peer', iceServers: [{ urls: ['stun:stun.example.com'] }] })
  const open = (member: string, more: Partial<CallMember> = {}) => {
    const sent: CallServerMessage[] = []
    const link = { send: vi.fn((message: CallServerMessage) => void sent.push(message)), close: vi.fn() }
    const session = backend.open({ call: 'standup', member, publish: true, ...more }, link)
    return { session, sent, link, last: (type: CallServerMessage['type']) => sent.filter((message) => message.type === type).at(-1) }
  }
  return { open }
}

describe('the peer plugin', () => {
  it('tells each member who else is in the call, with its ICE servers', async () => {
    const { open } = plugin()
    const ann = open('ann')
    await ann.session.receive({ type: 'join' })
    expect(ann.sent[0]).toEqual({ type: 'joined', mode: 'peer', participant: 'ann', iceServers: [{ urls: ['stun:stun.example.com'] }] })
    const bob = open('bob')
    await bob.session.receive({ type: 'join' })
    expect(ann.last('peers')).toEqual({ type: 'peers', members: ['bob'] })
    expect(bob.last('peers')).toEqual({ type: 'peers', members: ['ann'] })
  })

  it('passes descriptions and candidates to the member they name, from the member who sent them', async () => {
    const { open } = plugin()
    const ann = open('ann')
    const bob = open('bob')
    await ann.session.receive({ type: 'join' })
    await bob.session.receive({ type: 'join' })
    await ann.session.receive({ type: 'signal', to: 'bob', description: { type: 'offer', sdp: 'v=0' } })
    await ann.session.receive({ type: 'signal', to: 'nobody', candidate: { candidate: 'candidate:1' } })
    expect(bob.last('signal')).toEqual({ type: 'signal', from: 'ann', description: { type: 'offer', sdp: 'v=0' } })
    expect(ann.last('signal')).toBeUndefined()
  })

  it('lists a member\'s tracks to the others who hear them', async () => {
    const { open } = plugin()
    const ann = open('ann')
    const bob = open('bob', { hears: (track) => track.kind === 'video' })
    await ann.session.receive({ type: 'join' })
    await bob.session.receive({ type: 'join' })
    await ann.session.receive({ type: 'publish', tracks: [{ cid: 'cam', kind: 'video', source: 'camera' }, { cid: 'mic', kind: 'audio', source: 'microphone' }] })
    expect(ann.last('published')).toEqual({ type: 'published', tracks: [{ cid: 'cam', sid: 'cam' }, { cid: 'mic', sid: 'mic' }] })
    expect(bob.last('tracks')).toEqual({ type: 'tracks', tracks: [{ sid: 'cam', member: 'ann', kind: 'video', source: 'camera', muted: false }] })
    await ann.session.receive({ type: 'mute', sid: 'cam', muted: true })
    expect(bob.last('tracks')).toEqual({ type: 'tracks', tracks: [expect.objectContaining({ sid: 'cam', muted: true })] })
    await ann.session.receive({ type: 'unpublish', sid: 'cam' })
    expect(bob.last('tracks')).toEqual({ type: 'tracks', tracks: [] })
  })

  it('keeps a member whose socket was lost until they resume, or for a while', async () => {
    vi.useFakeTimers()
    const { open } = plugin()
    const ann = open('ann')
    const bob = open('bob')
    await ann.session.receive({ type: 'join' })
    await bob.session.receive({ type: 'join' })
    ann.session.end('lost')
    expect(bob.last('peers')).toEqual({ type: 'peers', members: ['ann'] })
    const again = open('ann')
    await again.session.receive({ type: 'resume', participant: 'ann', tracks: [{ cid: 'cam', sid: 'cam', kind: 'video', source: 'camera' }] })
    expect(again.sent[0]).toEqual({ type: 'resumed' })
    expect(bob.last('tracks')).toEqual({ type: 'tracks', tracks: [expect.objectContaining({ sid: 'cam', member: 'ann' })] })
    vi.advanceTimersByTime(60_000)
    expect(bob.last('peers')).toEqual({ type: 'peers', members: ['ann'] })

    again.session.end('lost')
    vi.advanceTimersByTime(60_000)
    expect(bob.last('peers')).toEqual({ type: 'peers', members: [] })
  })

  it('takes a member who left out at once, and replaces a member who joins twice', async () => {
    const { open } = plugin()
    const ann = open('ann')
    const bob = open('bob')
    await ann.session.receive({ type: 'join' })
    await bob.session.receive({ type: 'join' })
    const twice = open('bob')
    await twice.session.receive({ type: 'join' })
    expect(bob.link.close).toHaveBeenCalledWith(1000, 'left')
    expect(bob.last('left')).toEqual({ type: 'left', reason: 'removed' })
    twice.session.end('left')
    expect(ann.last('peers')).toEqual({ type: 'peers', members: [] })
  })
})
