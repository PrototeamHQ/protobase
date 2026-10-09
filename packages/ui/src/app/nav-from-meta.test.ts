import { describe, expect, it } from 'vitest'
import type { ResourceModel, ViewModel } from '@protobase/schema'
import { navFromMeta } from './nav-from-meta'

const model = (name: string, schema: string) => ({ name, table: { schema, name }, fields: {}, primaryKey: ['id'] }) as ResourceModel

describe('navFromMeta', () => {
  it('lists only resources with a view and honours nav.hidden', () => {
    const view = (resource: string, extra = {}) => ({ resource, fields: {}, filters: [], layout: [], actions: [], ...extra }) as unknown as ViewModel
    const meta = {
      etag: '"x"',
      permissions: {},
      pages: {},
      resources: { orders: model('orders', 'sales'), orderLines: model('orderLines', 'sales'), audit: model('audit', 'core') },
      views: { orders: view('orders'), orderLines: view('orderLines', { nav: { hidden: true } }) },
    }
    expect(navFromMeta(meta).flatMap((group) => group.items.map((item) => item.id))).toEqual(['orders'])
  })

  it('honours nav group and order', () => {
    const view = (resource: string, nav: object) => ({ resource, fields: {}, filters: [], layout: [], actions: [], nav }) as unknown as ViewModel
    const meta = {
      etag: '"x"',
      permissions: {},
      pages: {},
      resources: { orders: model('orders', 'sales'), invoices: model('invoices', 'sales') },
      views: { orders: view('orders', { order: 2, group: 'Revenue' }), invoices: view('invoices', { order: 1, group: 'Revenue' }) },
    }
    const groups = navFromMeta(meta)
    expect(groups.map((group) => group.label)).toEqual(['Revenue'])
    expect(groups[0]!.items.map((item) => item.id)).toEqual(['invoices', 'orders'])
  })

  it('groups resources by schema and prefers view names', () => {
    const meta = {
      etag: '"x"',
      permissions: {},
      pages: {},
      resources: { orders: model('orders', 'sales'), invoices: model('invoices', 'sales'), companies: model('companies', 'crm') },
      views: {
        orders: { resource: 'orders', names: { singular: 'Order', plural: 'Orders' }, fields: {}, filters: [], layout: [], actions: [] } as ViewModel,
        invoices: { resource: 'invoices', fields: {}, filters: [], layout: [], actions: [] } as ViewModel,
        companies: { resource: 'companies', fields: {}, filters: [], layout: [], actions: [] } as ViewModel,
      },
    }
    const groups = navFromMeta(meta, '/admin')
    expect(groups.map((group) => group.label)).toEqual(['Sales', 'CRM'])
    expect(groups[0]!.items.map((item) => [item.label, item.href])).toEqual([
      ['Orders', '/admin/orders'],
      ['Invoices', '/admin/invoices'],
    ])
  })

  it('leaves user menu resources out and attaches recent records', () => {
    const view = (resource: string) => ({ resource, fields: {}, filters: [], layout: [], actions: [] }) as unknown as ViewModel
    const meta = {
      etag: '"x"',
      permissions: {},
      resources: { orders: model('orders', 'sales'), organizations: model('organizations', 'core') },
      views: { orders: view('orders'), organizations: view('organizations') },
      pages: {},
      userMenu: { items: [{ kind: 'resource' as const, resource: 'organizations' }] },
    }
    const groups = navFromMeta(meta, '', { orders: { state: 'loading' } })
    expect(groups.flatMap((group) => group.items.map((item) => [item.id, item.recent]))).toEqual([['orders', { state: 'loading' }]])
  })

  it('puts pages first, in their group or under Pages, and honours their nav', () => {
    const view = (resource: string, nav: object = {}) => ({ resource, fields: {}, filters: [], layout: [], actions: [], nav }) as unknown as ViewModel
    const page = (name: string, nav?: object) => ({ name, title: name.toUpperCase(), tree: { type: 'Page', props: { title: name }, children: [] }, ...(nav && { nav }) })
    const meta = {
      etag: '"x"',
      permissions: {},
      resources: { companies: model('companies', 'crm'), orders: model('orders', 'sales') },
      views: { companies: view('companies'), orders: view('orders') },
      pages: { overview: page('overview', { group: 'Sales', order: 0 }), help: page('help'), hidden: page('hidden', { hidden: true }) },
    }
    const groups = navFromMeta(meta, '/admin')
    expect(groups.map((group) => [group.label, group.items.map((item) => item.id)])).toEqual([['Sales', ['overview', 'orders']], ['Pages', ['help']], ['CRM', ['companies']]])
    expect(groups[0]!.items[0]).toMatchObject({ label: 'OVERVIEW', href: '/admin/overview' })
  })

  it('leaves pages in the user menu out of the sidebar', () => {
    const page = (name: string) => ({ name, title: name, tree: { type: 'Page', props: { title: name }, children: [] } })
    const meta = { etag: '"x"', permissions: {}, resources: {}, views: {}, pages: { overview: page('overview'), billing: page('billing') }, userMenu: { items: [{ kind: 'page' as const, page: 'billing' }] } }
    expect(navFromMeta(meta).flatMap((group) => group.items.map((item) => item.id))).toEqual(['overview'])
  })
})
