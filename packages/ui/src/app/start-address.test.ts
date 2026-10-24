import { describe, expect, it } from 'vitest'
import type { ResourceModel, ViewModel } from '@protobase/schema'
import { startAddress } from './start-address'

const model = (name: string) => ({ name, table: { schema: 'sales', name }, fields: {}, primaryKey: ['id'] }) as ResourceModel
const view = (resource: string, extra = {}) => ({ resource, fields: {}, filters: [], layout: [], actions: [], ...extra }) as unknown as ViewModel
const page = (name: string, nav?: object) => ({ name, title: name, tree: { type: 'Page', props: { title: name }, children: [] }, ...(nav && { nav }) })
const meta = (extra = {}) => ({ etag: '"x"', appName: 'Protobase', permissions: {}, pages: {}, resources: {}, views: {}, ...extra })

describe('startAddress', () => {
  it('opens the first sidebar entry, not the first page by name', () => {
    // A config module namespace lists its exports alphabetically, so `/meta` does too.
    const pages = { archive: page('archive', { hidden: true }), newSecret: page('newSecret', { order: 2 }), overview: page('overview', { order: 1 }) }
    expect(startAddress(meta({ pages }))).toEqual({ kind: 'page', page: 'overview' })
  })

  it("opens a role's first visible entry when it cannot see the first one", () => {
    // `/meta` leaves out the pages a role may not open.
    const pages = { newSecret: page('newSecret', { order: 2 }), reports: page('reports', { order: 3 }) }
    expect(startAddress(meta({ pages }))).toEqual({ kind: 'page', page: 'newSecret' })
  })

  it('opens a resource list or a named list when one leads the sidebar, past one that cannot be reached', () => {
    const desk = { url: 'https://desk.example.com/api/v1', label: 'Desk', resources: ['tickets'] }
    const sources = [{ source: desk, state: 'error' as const, error: new Error('down') }]
    const lists = [{ name: 'open', names: { singular: 'Open order', plural: 'Open orders' }, filters: [], nav: { group: 'Aaa' } }]
    expect(startAddress(meta({ sources, resources: { orders: model('orders') }, views: { orders: view('orders') } }))).toEqual({ kind: 'list', resource: 'orders' })
    expect(startAddress(meta({ resources: { orders: model('orders') }, views: { orders: view('orders', { nav: { hidden: true }, lists }) } }))).toEqual({ kind: 'list', resource: 'orders', list: 'open' })
  })

  it('falls back to the first page, else the first resource, when the sidebar has no entries', () => {
    expect(startAddress(meta({ pages: { help: page('help', { hidden: true }) }, resources: { orders: model('orders') } }))).toEqual({ kind: 'page', page: 'help' })
    expect(startAddress(meta({ resources: { orders: model('orders') } }))).toEqual({ kind: 'list', resource: 'orders' })
    expect(startAddress(meta())).toBeUndefined()
  })
})
