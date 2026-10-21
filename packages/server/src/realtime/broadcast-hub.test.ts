import { describe, expect, it } from 'vitest'
import { realtimeLimits } from './realtime-limits'
import { broadcastHub, type BroadcastMember } from './broadcast-hub'

const member = (self: boolean) => {
  const heard: unknown[] = []
  const listener: BroadcastMember = { self, receive: (event, payload) => heard.push([event, payload]) }
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
})
