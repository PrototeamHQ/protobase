import { describe, expect, it } from 'vitest'
import type { ResourceModel, ViewModel } from '@protobase/schema'
import type { MetaData } from './meta-data'
import { sourceStatusOf, withSources } from './with-sources'

const model = (name: string) => ({ name, table: { name }, fields: {}, primaryKey: ['id'] }) as unknown as ResourceModel
const view = (resource: string) => ({ resource, fields: {}, filters: [], layout: [], actions: [] }) as unknown as ViewModel
const allowed = { create: true, update: true, delete: true, conditional: [] }

const desk = { url: 'https://desk.example.com/api/v1', label: 'Service desk', resources: ['tickets'] }
const cloud = { url: 'https://cloud.example.com/api/v1', label: 'Cloud', resources: ['tasks'] }

const own: MetaData = {
  etag: '"own"',
  appName: 'Protobase',
  resources: { orders: model('orders') },
  views: { orders: view('orders') },
  pages: {},
  permissions: { orders: allowed },
  sources: [{ source: desk, state: 'loading' }, { source: cloud, state: 'loading' }],
}

describe('withSources', () => {
  it("adds the resources, views and permissions of each ready source to the app's, and how far each has loaded", () => {
    const merged = withSources(own, [
      { source: desk, state: 'ready', meta: { resources: [model('tickets')], views: [view('tickets')], permissions: { tickets: allowed } } },
      { source: cloud, state: 'error', error: new Error('down') },
    ])
    expect(Object.keys(merged.resources)).toEqual(['orders', 'tickets'])
    expect(Object.keys(merged.views)).toEqual(['orders', 'tickets'])
    expect(merged.permissions).toEqual({ orders: allowed, tickets: allowed })
    expect(merged.sources).toEqual([{ source: desk, state: 'ready' }, { source: cloud, state: 'error', error: new Error('down') }])
    expect(sourceStatusOf(merged, 'tasks')).toEqual({ source: cloud, state: 'error', error: new Error('down') })
    expect(sourceStatusOf(merged, 'orders')).toBeUndefined()
  })

  it('adds nothing for a source that is still loading', () => {
    const merged = withSources(own, [{ source: desk, state: 'loading' }, { source: cloud, state: 'loading' }])
    expect(Object.keys(merged.resources)).toEqual(['orders'])
    expect(sourceStatusOf(merged, 'tickets')).toEqual({ source: desk, state: 'loading' })
  })
})
