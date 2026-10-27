import { describe, expect, it } from 'vitest'
import { realtimeLimits } from './realtime-limits'
import { broadcastHub, type BroadcastMember } from './broadcast-hub'

const member = (self: boolean, isPrivate = false) => {
  const heard: unknown[] = []
  const listener: BroadcastMember = { self, private: isPrivate, receive: (event, payload) => heard.push([event, payload]) }
  return { listener, heard }
}

describe('broadcastHub', () => {
  it('sends a broadcast to the topic\'s other members, and to the sender only when it hears its own', () => {
    const hub = broadcastHub()
    const [alice, bob, carol, elsewhere] = [member(false), member(true), member(false), member(false)]
    hub.join('realtime:room', alice.listener)
    const offBob = hub.join('realtime:room', bob.listener)
    hub.join('realtime:room', carol.listener)
    hub.join('realtime:other', elsewhere.listener)
    hub.send('realtime:room', alice.listener, 'hi', { n: 1 })
    hub.send('realtime:room', bob.listener, 'hey', { n: 2 })
    offBob()
    hub.send('realtime:room', alice.listener, 'bye', {})
    expect(alice.heard).toEqual([['hey', { n: 2 }]])
    expect(bob.heard).toEqual([['hi', { n: 1 }], ['hey', { n: 2 }]])
    expect(carol.heard).toEqual([['hi', { n: 1 }], ['hey', { n: 2 }], ['bye', {}]])
    expect(elsewhere.heard).toEqual([])
  })

  it('takes only so many broadcasts into a topic each second, whoever sends them, even across it emptying', () => {
    let at = 0
    const hub = broadcastHub({ now: () => at })
    const [alice, bob, carol, elsewhere] = [member(false), member(false), member(false), member(false)]
    hub.join('realtime:room', alice.listener)
    const offBob = hub.join('realtime:room', bob.listener)
    hub.join('realtime:other', elsewhere.listener)
    const max = realtimeLimits.topicBroadcastsPerSecond
    for (let n = 0; n < max / 2; n++) expect(hub.send('realtime:room', alice.listener, 'a', n)).toBe(true)
    for (let n = 0; n < max / 2; n++) expect(hub.send('realtime:room', bob.listener, 'b', n)).toBe(true)
    expect(hub.send('realtime:room', alice.listener, 'over', {})).toBe(false)
    expect(hub.send('realtime:other', alice.listener, 'there', {})).toBe(true)
    expect(bob.heard).toHaveLength(max / 2)
    expect(alice.heard).toHaveLength(max / 2)
    expect(elsewhere.heard).toEqual([['there', {}]])

    offBob()
    hub.join('realtime:room', carol.listener)
    at = 999
    expect(hub.send('realtime:room', alice.listener, 'over', {})).toBe(false)
    expect(carol.heard).toEqual([])
    at = 1000
    expect(hub.send('realtime:room', alice.listener, 'next', {})).toBe(true)
    expect(carol.heard).toEqual([['next', {}]])
  })

  it('keeps a topic\'s private members apart from its public ones', () => {
    const hub = broadcastHub()
    const [open, closed, closedToo] = [member(false), member(false, true), member(false, true)]
    hub.join('realtime:room', open.listener)
    hub.join('realtime:room', closed.listener)
    hub.join('realtime:room', closedToo.listener)
    hub.send('realtime:room', open.listener, 'public', {})
    hub.send('realtime:room', closed.listener, 'private', {})
    expect([open.heard, closed.heard, closedToo.heard]).toEqual([[], [], [['private', {}]]])
  })

  it('publishes broadcasts without a sender to the public members of the topic, or the private ones', () => {
    const hub = broadcastHub()
    const [open, closed, elsewhere] = [member(false), member(false, true), member(false)]
    hub.join('realtime:room', open.listener)
    hub.join('realtime:room', closed.listener)
    hub.join('realtime:other', elsewhere.listener)
    expect(hub.publish([
      { topic: 'realtime:room', event: 'public', payload: { n: 1 }, private: false },
      { topic: 'realtime:room', event: 'private', payload: { n: 2 }, private: true },
    ])).toBe(true)
    expect(open.heard).toEqual([['public', { n: 1 }]])
    expect(closed.heard).toEqual([['private', { n: 2 }]])
    expect(elsewhere.heard).toEqual([])
  })

  it('publishes none of a batch that would take a topic over its broadcasts for the second', () => {
    const hub = broadcastHub({ now: () => 0 })
    const [room, other] = [member(false), member(false)]
    hub.join('realtime:room', room.listener)
    hub.join('realtime:other', other.listener)
    const max = realtimeLimits.topicBroadcastsPerSecond
    for (let n = 1; n < max; n++) expect(hub.send('realtime:room', room.listener, 'a', n)).toBe(true)
    const batch = (topic: string) => ({ topic, event: 'b', payload: {}, private: false })
    expect(hub.publish([batch('realtime:other'), batch('realtime:room'), batch('realtime:room')])).toBe(false)
    expect(other.heard).toEqual([])
    expect(hub.publish([batch('realtime:other'), batch('realtime:room')])).toBe(true)
    expect([room.heard, other.heard]).toEqual([[['b', {}]], [['b', {}]]])
  })
})
