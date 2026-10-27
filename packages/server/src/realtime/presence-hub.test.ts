import { describe, expect, it } from 'vitest'
import { presenceHub, type PresenceChange, type PresenceDiff } from './presence-hub'

const plain = (value: unknown) => JSON.parse(JSON.stringify(value))

describe('presenceHub', () => {
  it('tells listening members of joins, updates and leaves on their topic, and gives its state', () => {
    const hub = presenceHub()
    const heard: PresenceDiff[] = []
    const deaf: PresenceDiff[] = []
    const alice = hub.join('realtime:room', { key: 'alice', private: false, listens: true, receive: (diff) => heard.push(plain(diff)) })
    const bob = hub.join('realtime:room', { key: 'bob', private: false, listens: false, receive: (diff) => deaf.push(diff) })
    hub.join('realtime:other', { key: 'carol', private: false, listens: true, receive: () => expect.unreachable() })
    hub.join('realtime:room', { key: 'dave', private: true, listens: true, receive: () => expect.unreachable() })

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
    const seat = presenceHub().join('realtime:room', { key: '__proto__', private: false, listens: false, receive: () => {} })
    seat.track({ a: 1 })
    expect(JSON.stringify(seat.state())).toBe('{"__proto__":{"metas":[{"a":1,"phx_ref":"1"}]}}')
  })

  it('adds the other processes\' presences to the state, tells them each change, and tells the channels theirs', () => {
    const changes: PresenceChange[] = []
    const hub = presenceHub({ refPrefix: 'p:', remote: { state: (topic, isPrivate) => (isPrivate ? [] : [['bob', { phx_ref: 'q:1' }]]), changed: (change) => changes.push(change), ready: async () => {} } })
    const heard: PresenceDiff[] = []
    const alice = hub.join('realtime:room', { key: 'alice', private: false, listens: true, receive: (diff) => heard.push(diff) })
    alice.track({ a: 1 })
    alice.untrack()
    hub.hear('realtime:room', true, { joins: { carol: { metas: [{ phx_ref: 'q:2' }] } }, leaves: {} })
    hub.hear('realtime:room', false, { joins: { dave: { metas: [{ phx_ref: 'q:3' }] } }, leaves: {} })

    expect(plain(alice.state())).toEqual({ bob: { metas: [{ phx_ref: 'q:1' }] } })
    expect(changes).toEqual([
      { topic: 'realtime:room', private: false, key: 'alice', joined: { a: 1, phx_ref: 'p:1' } },
      { topic: 'realtime:room', private: false, key: 'alice', left: { a: 1, phx_ref: 'p:1' } },
    ])
    expect(heard.at(-1)).toEqual({ joins: { dave: { metas: [{ phx_ref: 'q:3' }] } }, leaves: {} })
    expect(heard).toHaveLength(3)
  })

  it('lists the presences its channels track', () => {
    const hub = presenceHub()
    hub.join('realtime:room', { key: 'alice', private: true, listens: false, receive: () => {} }).track({ a: 1 })
    hub.join('realtime:room', { key: 'bob', private: false, listens: false, receive: () => {} })
    expect(hub.tracked()).toEqual([{ topic: 'realtime:room', private: true, key: 'alice', meta: { a: 1, phx_ref: '1' } }])
  })
})
