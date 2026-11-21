import { describe, expect, it } from 'vitest'
import type { ResourceModel, ViewModel } from '@protobase/schema'
import { startEntry, startKey, startRequest } from './start-record'

const model = (name: string) => ({ name, table: { schema: 'public', name }, fields: { id: { type: 'integer', sortable: true } }, primaryKey: ['id'] }) as unknown as ResourceModel
const view = (resource: string, nav?: object) => ({ resource, fields: {}, filters: [], layout: [], actions: [], ...(nav && { nav }) }) as unknown as ViewModel
const meta = (views: Record<string, ViewModel>) => ({
  etag: '"x"',
  appName: 'Chat',
  permissions: {},
  pages: {},
  resources: Object.fromEntries(Object.keys(views).map((name) => [name, model(name)])),
  views,
})
const general = { filter: 'name = "general"' }

describe('startEntry', () => {
  it('is the first entry in sidebar order whose view names a start record', () => {
    const found = startEntry(meta({ people: view('people', { order: 1 }), channels: view('channels', { order: 2, start: general }), topics: view('topics', { order: 3, start: { filter: 'id = 1' } }) }))
    expect(found).toMatchObject({ model: { name: 'channels' }, start: general })
  })

  it('is none without one, or when the entry is hidden from the sidebar', () => {
    expect(startEntry(meta({ channels: view('channels') }))).toBeUndefined()
    expect(startEntry(meta({ channels: view('channels', { hidden: true, start: general }) }))).toBeUndefined()
  })
})

describe('startRequest', () => {
  it("asks for one row, its key alone, in the order given or else the list's", () => {
    const channels = meta({ channels: view('channels', { start: general }) })
    expect(startRequest(startEntry(channels)!, channels)).toEqual({ filter: 'name = "general"', orderBy: 'id asc', pageSize: 1, fields: ['id'] })
    const ordered = meta({ channels: view('channels', { start: { ...general, orderBy: 'id desc' } }) })
    expect(startRequest(startEntry(ordered)!, ordered).orderBy).toBe('id desc')
  })
})

describe('startKey', () => {
  it('is the address key of the row found, and none when nothing matched', () => {
    expect(startKey(model('channels'), [{ id: 7 }])).toBe('7')
    expect(startKey(model('channels'), [])).toBeUndefined()
  })
})
