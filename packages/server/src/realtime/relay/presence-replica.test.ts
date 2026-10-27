import { describe, expect, it } from 'vitest'
import { presenceReplica } from './presence-replica'

const meta = (ref: string) => ({ phx_ref: ref, online: true })

describe('presenceReplica', () => {
  it('tells only what a diff changed, so a frame read twice tells nothing', () => {
    const replica = presenceReplica()
    replica.load([{ topic: 'room', private: false, key: 'alice', meta: meta('a1') }])
    expect(replica.apply('room', false, { joins: { alice: { metas: [meta('a1')] }, bob: { metas: [meta('b1')] } }, leaves: {} })).toEqual({ joins: { bob: { metas: [meta('b1')] } }, leaves: {} })
    expect(replica.apply('room', false, { joins: { bob: { metas: [meta('b1')] } }, leaves: {} })).toBeUndefined()
    expect(replica.apply('room', false, { joins: {}, leaves: { alice: { metas: [meta('a1')] } } })).toEqual({ joins: {}, leaves: { alice: { metas: [meta('a1')] } } })
    expect(replica.apply('room', false, { joins: {}, leaves: { alice: { metas: [meta('a1')] } } })).toBeUndefined()
    expect(replica.state('room', false)).toEqual([['bob', meta('b1')]])
  })

  it('keeps a topic\'s private and public presences apart', () => {
    const replica = presenceReplica()
    replica.apply('room', true, { joins: { alice: { metas: [meta('a1')] } }, leaves: {} })
    expect(replica.state('room', false)).toEqual([])
    expect(replica.apply('room', false, { joins: {}, leaves: { alice: { metas: [meta('a1')] } } })).toBeUndefined()
    expect(replica.state('room', true)).toEqual([['alice', meta('a1')]])
  })

  it('starts over on a load', () => {
    const replica = presenceReplica()
    replica.apply('room', false, { joins: { alice: { metas: [meta('a1')] } }, leaves: {} })
    replica.load([])
    expect(replica.state('room', false)).toEqual([])
  })
})
