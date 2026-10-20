import { describe, expect, it } from 'vitest'
import { presenceHub, type PresenceDiff } from './presence-hub'

const plain = (value: unknown) => JSON.parse(JSON.stringify(value))

describe('presenceHub', () => {
  it('tells listening members of joins, updates and leaves on their topic, and gives its state', () => {
    const hub = presenceHub()
    const heard: PresenceDiff[] = []
    const deaf: PresenceDiff[] = []
    const alice = hub.join('realtime:room', { key: 'alice', listens: true, receive: (diff) => heard.push(plain(diff)) })
    const bob = hub.join('realtime:room', { key: 'bob', listens: false, receive: (diff) => deaf.push(diff) })
    hub.join('realtime:other', { key: 'carol', listens: true, receive: () => expect.unreachable() })

    bob.track({ status: 'online' })
    alice.track({ status: 'online' })
    bob.track({ status: 'away' })
    expect(plain(alice.state())).toEqual({ alice: { metas: [{ status: 'online', phx_ref: '2' }] }, bob: { metas: [{ status: 'away', phx_ref: '3', phx_ref_prev: '1' }] } })
    bob.untrack()
    bob.untrack()
    alice.leave()

    expect(heard).toEqual([
      { joins: { bob: { metas: [{ status: 'online', phx_ref: '1' }] } }, leaves: {} },
      { joins: { alice: { metas: [{ status: 'online', phx_ref: '2' }] } }, leaves: {} },
      { joins: { bob: { metas: [{ status: 'away', phx_ref: '3', phx_ref_prev: '1' }] } }, leaves: { bob: { metas: [{ status: 'online', phx_ref: '1' }] } } },
      { joins: {}, leaves: { bob: { metas: [{ status: 'away', phx_ref: '3', phx_ref_prev: '1' }] } } },
      { joins: {}, leaves: { alice: { metas: [{ status: 'online', phx_ref: '2' }] } } },
    ])
    expect(deaf).toEqual([])
    expect(plain(bob.state())).toEqual({})
  })

  it('keeps a key such as __proto__ as a key', () => {
    const seat = presenceHub().join('realtime:room', { key: '__proto__', listens: false, receive: () => {} })
    seat.track({ a: 1 })
    expect(JSON.stringify(seat.state())).toBe('{"__proto__":{"metas":[{"a":1,"phx_ref":"1"}]}}')
  })
})
