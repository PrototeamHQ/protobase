import { describe, expect, it, vi } from 'vitest'
import type { CallServerMessage } from '@protobase/schema/internal'
import type { CallRoom } from '../media-backend'
import { callHarness, settle } from '../testing/call-harness'
import { peerBackend } from './peer-backend'

// One member's session of the plugin, with a room that keeps what the member did in it.
const session = (hears?: (track: { kind: string }) => boolean) => {
  const sent: CallServerMessage[] = []
  const link = { send: vi.fn((message: CallServerMessage) => void sent.push(message)), close: vi.fn() }
  const room = { call: '7', tracks: vi.fn(async () => {}), signal: vi.fn(async () => {}) } satisfies CallRoom
  const opened = peerBackend({ kind: 'peer', iceServers: [{ urls: ['stun:stun.example.com'] }] }).open({ call: '7', member: 'ann', publish: true, ...(hears && { hears }) }, link, room)
  return { opened, sent, link, room }
}

describe('the peer plugin', () => {
  it('tells the member they joined the call, with its ICE servers', async () => {
    const { opened, sent } = session()
    await opened.receive({ type: 'join' })
    expect(sent).toEqual([{ type: 'joined', call: '7', mode: 'peer', participant: 'ann', iceServers: [{ urls: ['stun:stun.example.com'] }] }])
  })

  it('shares the tracks the member sends with the call, as they publish, mute and stop them', async () => {
    const { opened, sent, room } = session()
    await opened.receive({ type: 'publish', tracks: [{ cid: 'cam', kind: 'video', source: 'camera' }] })
    expect(sent.at(-1)).toEqual({ type: 'published', tracks: [{ cid: 'cam', sid: 'cam' }] })
    expect(room.tracks).toHaveBeenLastCalledWith([{ sid: 'cam', member: 'ann', kind: 'video', source: 'camera', muted: false }])
    await opened.receive({ type: 'mute', sid: 'cam', muted: true })
    expect(room.tracks).toHaveBeenLastCalledWith([expect.objectContaining({ sid: 'cam', muted: true })])
    await opened.receive({ type: 'unpublish', sid: 'cam' })
    expect(room.tracks).toHaveBeenLastCalledWith([])
  })

  it('passes a description to the room for the member it names, never naming the sender itself', async () => {
    const { opened, room } = session()
    await opened.receive({ type: 'signal', to: 'bob', description: { type: 'offer', sdp: 'v=0' } })
    expect(room.signal).toHaveBeenCalledWith('bob', { description: { type: 'offer', sdp: 'v=0' } })
  })

  it('lists the others and the tracks of theirs the member hears', () => {
    const { opened, sent } = session((track) => track.kind === 'video')
    opened.roster!([
      { row: '1', member: 'ann', process: 'p', joined_at: 't', tracks: [] },
      { row: '2', member: 'bob', process: 'p', joined_at: 't', tracks: [{ sid: 'cam', member: 'bob', kind: 'video', source: 'camera', muted: false }, { sid: 'mic', member: 'bob', kind: 'audio', source: 'microphone', muted: false }] },
    ])
    expect(sent).toEqual([{ type: 'peers', members: ['bob'] }, { type: 'tracks', tracks: [{ sid: 'cam', member: 'bob', kind: 'video', source: 'camera', muted: false }] }])
  })
})

describe('a peer-to-peer call', () => {
  it('lists every member, members who send nothing too, to each of them', async () => {
    const { member } = callHarness()
    const ann = await member('ann')
    await ann.send({ type: 'join' })
    const bob = await member('bob', { rights: { publish: false } })
    await bob.send({ type: 'join' })
    await settle()
    expect(ann.last('peers')).toEqual({ type: 'peers', members: ['bob'] })
    expect(bob.last('peers')).toEqual({ type: 'peers', members: ['ann'] })
    expect(ann.last('members')?.members.map((present) => present.member)).toEqual(['ann', 'bob'])
    expect(bob.last('members')?.members.map((present) => present.member)).toEqual(['ann', 'bob'])
  })

  it('tells the member who joined before anything of the call', async () => {
    const { member } = callHarness()
    const ann = await member('ann')
    await ann.send({ type: 'join' })
    await settle()
    expect(ann.sent.map((message) => message.type)).toEqual(['joined', 'members', 'peers', 'tracks'])
  })

  it('keeps a member whose socket was lost until they resume, and their tracks', async () => {
    const { member } = callHarness()
    const ann = await member('ann')
    const bob = await member('bob')
    await ann.send({ type: 'join' })
    await bob.send({ type: 'join' })
    await ann.closed(1006)
    await settle()
    expect(bob.last('peers')).toEqual({ type: 'peers', members: ['ann'] })
    const again = await member('ann')
    await again.send({ type: 'resume', call: ann.last('joined')!.call, participant: 'ann', tracks: [{ cid: 'cam', sid: 'cam', kind: 'video', source: 'camera' }] })
    await settle()
    expect(again.sent[0]).toEqual({ type: 'resumed' })
    expect(bob.last('tracks')).toEqual({ type: 'tracks', tracks: [expect.objectContaining({ sid: 'cam', member: 'ann' })] })
  })

  it('takes a member who left out at once, and replaces a member who joins twice', async () => {
    const { member } = callHarness()
    const ann = await member('ann')
    const bob = await member('bob')
    await ann.send({ type: 'join' })
    await bob.send({ type: 'join' })
    const twice = await member('bob')
    await twice.send({ type: 'join' })
    expect(bob.closes).toContainEqual([1008, 'removed'])
    expect(bob.last('left')).toEqual({ type: 'left', reason: 'removed' })
    await twice.send({ type: 'leave' })
    await settle()
    expect(ann.last('peers')).toEqual({ type: 'peers', members: [] })
  })
})
