import { describe, expect, it } from 'vitest'
import { graceSeconds } from './call-store'
import { callHarness, settle, standup } from './testing/call-harness'

const offer = { type: 'signal', description: { type: 'offer', sdp: 'v=0' } }

describe('removing a member from a call', () => {
  it('closes their socket, drops them from every other member\'s list, and refuses their resume and their join', async () => {
    const { member, store, hub } = callHarness()
    const ann = await member('ann')
    const bob = await member('bob')
    await ann.send({ type: 'join' })
    await bob.send({ type: 'join' })
    const call = ann.last('joined')!.call
    expect(await store.remove(call, 'bob')).toBe(true)
    await hub.refresh([call])
    expect(bob.last('left')).toEqual({ type: 'left', reason: 'removed' })
    expect(bob.closes).toContainEqual([1008, 'removed'])
    expect(ann.last('peers')).toEqual({ type: 'peers', members: [] })

    const resumed = await member('bob')
    await resumed.send({ type: 'resume', call, participant: 'bob', tracks: [] })
    expect(resumed.sent).toEqual([{ type: 'left', reason: 'removed' }])
    expect(resumed.closes).toContainEqual([1008, 'You were removed from this call'])
    const joined = await member('bob')
    await joined.send({ type: 'join' })
    expect(joined.sent).toEqual([{ type: 'left', reason: 'removed' }])
    expect(ann.last('members')?.members.map((present) => present.member)).toEqual(['ann'])
  })

  it('keeps out a member whose join was on its way as the removal came', async () => {
    const { member, store } = callHarness()
    const ann = await member('ann')
    await ann.send({ type: 'join' })
    const call = ann.last('joined')!.call
    const bob = await member('bob')
    expect(await store.remove(call, 'bob')).toBe(false)
    await bob.send({ type: 'join' })
    expect(bob.sent).toEqual([{ type: 'left', reason: 'removed' }])
    expect((await store.recordCalls([standup])).values().next().value![0]!.removed.map((removed) => removed.member)).toEqual(['bob'])
  })

  it('changes nothing in another call, nor in a call that ended', async () => {
    const { member, store } = callHarness()
    const ann = await member('ann')
    const bob = await member('bob', { record: { resource: 'meetings', key: '2' } })
    await ann.send({ type: 'join' })
    await bob.send({ type: 'join' })
    expect(await store.remove(ann.last('joined')!.call, 'bob')).toBe(false)
    expect(bob.last('left')).toBeUndefined()
    await ann.send({ type: 'leave' })
    await settle()
    expect(await store.remove(ann.last('joined')!.call, 'ann')).toBe(false)
    expect(await store.remove('999', 'bob')).toBe(false)
    expect(bob.last('left')).toBeUndefined()
  })
})

describe('the size of a call', () => {
  it('refuses one member more than the limit, with its reason, and lets a member in again once someone left', async () => {
    const { member } = callHarness({ maxMembers: 2 })
    const ann = await member('ann')
    const bob = await member('bob')
    await ann.send({ type: 'join' })
    await bob.send({ type: 'join' })
    const cy = await member('cy')
    await cy.send({ type: 'join' })
    expect(cy.sent).toEqual([{ type: 'left', reason: 'full' }])
    expect(cy.closes).toContainEqual([1008, 'This call is full'])
    await bob.send({ type: 'leave' })
    const again = await member('cy')
    await again.send({ type: 'join' })
    expect(again.last('joined')).toBeDefined()
  })
})

describe('signaling in a call', () => {
  it('reaches only a member of the same call, from the member who sent it', async () => {
    const { member } = callHarness()
    const ann = await member('ann')
    const bob = await member('bob')
    const cy = await member('cy', { record: { resource: 'meetings', key: '2' } })
    for (const one of [ann, bob, cy]) await one.send({ type: 'join' })
    await ann.send({ ...offer, to: 'bob' })
    await ann.send({ ...offer, to: 'cy' })
    await ann.send({ ...offer, to: 'ann' })
    expect(bob.sent.filter((message) => message.type === 'signal')).toEqual([{ type: 'signal', from: 'ann', description: { type: 'offer', sdp: 'v=0' } }])
    expect(cy.last('signal')).toBeUndefined()
    expect(ann.last('signal')).toBeUndefined()
  })

  it('drops what a member sends beyond a hundred signals a second', async () => {
    const { member } = callHarness()
    const ann = await member('ann')
    const bob = await member('bob')
    await ann.send({ type: 'join' })
    await bob.send({ type: 'join' })
    for (let index = 0; index < 150; index++) await ann.send({ type: 'signal', to: 'bob', candidate: { candidate: `candidate:${index}` } })
    expect(bob.sent.filter((message) => message.type === 'signal')).toHaveLength(100)
  })

  it('goes nowhere from a member who was removed, once the process read the removal', async () => {
    const { member, store, hub } = callHarness()
    const ann = await member('ann')
    const bob = await member('bob')
    await ann.send({ type: 'join' })
    await bob.send({ type: 'join' })
    await store.remove(ann.last('joined')!.call, 'bob')
    await hub.refresh([ann.last('joined')!.call])
    await bob.send({ ...offer, to: 'ann' })
    expect(ann.last('signal')).toBeUndefined()
  })
})

describe('a call over several processes', () => {
  it('meets members another process serves, and passes their signals to that process', async () => {
    const { member, process } = callHarness({ manyProcesses: true })
    const other = process()
    const ann = await member('ann')
    const bob = await member('bob', { hub: other })
    await ann.send({ type: 'join' })
    await bob.send({ type: 'join' })
    await settle()
    expect(bob.last('peers')).toEqual({ type: 'peers', members: ['ann'] })
    await ann.hub.refreshAll()
    expect(ann.last('peers')).toEqual({ type: 'peers', members: ['bob'] })
    await bob.send({ ...offer, to: 'ann' })
    await expect.poll(() => ann.last('signal'), { timeout: 2000 }).toEqual({ type: 'signal', from: 'bob', description: { type: 'offer', sdp: 'v=0' } })
  })

  it('delivers a signal for one call only to the member in that call, not to their session in another', async () => {
    const { member, process, store } = callHarness({ manyProcesses: true })
    const other = process()
    const ann = await member('ann')
    const bobHere = await member('bob', { hub: other })
    const bobThere = await member('bob', { hub: other, record: { resource: 'meetings', key: '2' } })
    for (const one of [ann, bobHere, bobThere]) await one.send({ type: 'join' })
    await ann.hub.refreshAll()
    await ann.send({ ...offer, to: 'bob' })
    await expect.poll(() => bobHere.last('signal'), { timeout: 2000 }).toBeDefined()
    expect(bobThere.last('signal')).toBeUndefined()
    // A signal stored for a call its sender is not in is dropped by the receiving process.
    await store.writeSignal({ process: other.process, call: bobThere.last('joined')!.call, to: 'bob', from: 'ann', body: offer })
    await new Promise((resolve) => setTimeout(resolve, 300))
    expect(bobThere.last('signal')).toBeUndefined()
  })
})

describe('the end of a call', () => {
  it('comes with its last member leaving, and a resume of it is refused while a join starts another', async () => {
    const { member, store } = callHarness()
    const ann = await member('ann')
    await ann.send({ type: 'join' })
    const call = ann.last('joined')!.call
    await ann.send({ type: 'leave' })
    await settle()
    expect((await store.rosters([call])).get(call)?.ended).toBe(true)
    const resumed = await member('ann')
    await resumed.send({ type: 'resume', call, participant: 'ann', tracks: [] })
    expect(resumed.sent).toEqual([{ type: 'left', reason: 'ended' }])
    const joined = await member('ann')
    await joined.send({ type: 'join' })
    expect(joined.last('joined')!.call).not.toBe(call)
  })

  it('comes at its last minute, closing every member out, however busy their sockets are', async () => {
    let now = Date.parse('2026-10-29T10:00:00Z')
    const { member, store, hub } = callHarness({ now: () => now })
    const ann = await member('ann')
    const bob = await member('bob')
    await ann.send({ type: 'join' })
    await bob.send({ type: 'join' })
    now += 60 * 60_000
    await hub.beat()
    await store.sweep()
    await hub.refreshAll()
    expect(ann.last('left')).toEqual({ type: 'left', reason: 'ended' })
    expect(bob.closes).toContainEqual([1000, 'ended'])
  })

  it('takes out a member whose socket was lost once the grace is over, and ends the call without anyone left', async () => {
    let now = Date.parse('2026-10-29T10:00:00Z')
    const { member, store, hub } = callHarness({ now: () => now })
    const ann = await member('ann')
    const bob = await member('bob')
    await ann.send({ type: 'join' })
    await bob.send({ type: 'join' })
    await bob.closed(1006)
    now += (graceSeconds + 1) * 1000
    await hub.beat()
    await store.sweep()
    await hub.refreshAll()
    expect(ann.last('peers')).toEqual({ type: 'peers', members: [] })
    await ann.closed(1006)
    now += (graceSeconds + 1) * 1000
    await store.sweep()
    expect((await store.rosters([ann.last('joined')!.call])).get(ann.last('joined')!.call)?.ended).toBe(true)
  })
})

describe('a member\'s socket that closes', () => {
  it('takes them out at once when the server refused or failed them, so no grace keeps them in', async () => {
    const { member } = callHarness()
    const ann = await member('ann')
    const bob = await member('bob')
    await ann.send({ type: 'join' })
    await bob.send({ type: 'join' })
    await bob.closed(1011)
    await settle()
    expect(ann.last('peers')).toEqual({ type: 'peers', members: [] })
  })

  it('refuses a second join or resume on the same socket, and anything before one', async () => {
    const { member } = callHarness()
    const early = await member('ann')
    await early.send({ type: 'publish', tracks: [{ cid: 'mic', kind: 'audio', source: 'microphone' }] })
    expect(early.closes).toContainEqual([1008, 'Join or resume the call first'])
    const ann = await member('ann')
    await ann.send({ type: 'join' })
    await ann.send({ type: 'join' })
    expect(ann.closes).toContainEqual([1008, 'The call session already started'])
  })
})
