import { describe, expect, it } from 'vitest'
import type { ResourceModel, ViewModel } from '@protobase/schema'
import { startAddress } from './start-address'
import { startEntry } from './start-record'
import { metaSettled, startTarget, type StartLookup } from './start-target'

const model = (name: string) => ({ name, table: { schema: 'public', name }, fields: { id: { type: 'integer', sortable: true } }, primaryKey: ['id'] }) as unknown as ResourceModel
const channelsView = (nav: object) => ({ resource: 'channels', fields: {}, filters: [], layout: [], actions: [], nav }) as unknown as ViewModel
const chatMeta = (nav: object) => ({ etag: '"x"', appName: 'Chat', permissions: {}, pages: {}, resources: { channels: model('channels') }, views: { channels: channelsView(nav) } })
// Outside any organization the caller cannot read the channels yet, so `/meta` names no start
const outsideMeta = chatMeta({})
const insideMeta = { ...chatMeta({ start: { filter: 'is_default = true' } }), etag: '"inside"' }

const found: StartLookup = { pending: false, failed: false, rows: [{ id: 1 }] }
const target = (meta: typeof insideMeta, rest: { organization?: string | null; metaSettled: boolean; lookup?: StartLookup }) =>
  startTarget({ entry: startEntry(meta), fallback: startAddress(meta), enabled: true, organization: 'org-1', lookup: found, ...rest })

const general = { state: 'ready', address: { kind: 'record', resource: 'channels', key: '1' } }
const channels = { state: 'ready', address: { kind: 'list', resource: 'channels' } }

describe('startTarget', () => {
  it('waits on a cached `/meta` from outside the organization, then opens the start record the fresh one names', () => {
    expect(target(outsideMeta, { metaSettled: false })).toEqual({ state: 'resolving' })
    expect(target(insideMeta, { metaSettled: false })).toEqual({ state: 'resolving' })
    expect(target(insideMeta, { metaSettled: true })).toEqual(general)
  })

  it('opens the first sidebar entry when the fresh `/meta` names no start', () => {
    expect(target(outsideMeta, { metaSettled: true })).toEqual(channels)
    expect(target(outsideMeta, { organization: undefined, metaSettled: true })).toEqual(channels)
  })

  it('resolves while the start record is looked up in the organization', () => {
    expect(target(insideMeta, { metaSettled: true, lookup: { pending: true, failed: false } })).toEqual({ state: 'resolving' })
    expect(target(insideMeta, { organization: undefined, metaSettled: true })).toEqual({ state: 'resolving' })
  })

  it('opens the start record from the cached `/meta` in an app without organizations', () => {
    expect(target(insideMeta, { organization: '', metaSettled: false })).toEqual(general)
  })

  it('opens the first entry when the organization cannot be read, or the lookup failed or found nothing', () => {
    expect(target(insideMeta, { organization: null, metaSettled: false })).toEqual(channels)
    expect(target(insideMeta, { metaSettled: true, lookup: { pending: false, failed: true } })).toEqual(channels)
    expect(target(insideMeta, { metaSettled: true, lookup: { pending: false, failed: false, rows: [] } })).toEqual(channels)
  })

  it('opens the first entry rather than resolving when not enabled', () => {
    expect(startTarget({ entry: startEntry(insideMeta), fallback: startAddress(insideMeta), enabled: false, organization: 'org-1', metaSettled: false, lookup: found })).toEqual(channels)
  })
})

describe('metaSettled', () => {
  const startedAt = 1000

  it("is the `/meta` drawn once the query holds it from this page load", () => {
    expect(metaSettled(insideMeta, { data: insideMeta, dataUpdatedAt: 1500 }, startedAt, false)).toBe(true)
  })

  it("is not the start cache's `/meta`, nor one drawn while the query already holds the next", () => {
    expect(metaSettled(outsideMeta, { data: outsideMeta, dataUpdatedAt: 500 }, startedAt, false)).toBe(false)
    expect(metaSettled(outsideMeta, { data: insideMeta, dataUpdatedAt: 1500 }, startedAt, false)).toBe(false)
  })

  it("is the start cache's `/meta` once reading it again failed", () => {
    expect(metaSettled(outsideMeta, { data: outsideMeta, dataUpdatedAt: 500 }, startedAt, true)).toBe(true)
  })
})
