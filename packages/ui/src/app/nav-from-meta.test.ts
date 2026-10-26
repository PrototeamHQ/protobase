import { describe, expect, it } from 'vitest'
import type { ResourceModel, ViewModel } from '@protobase/schema'
import { navFromMeta } from './nav-from-meta'

const model = (name: string, schema: string) => ({ name, table: { schema, name }, fields: {}, primaryKey: ['id'] }) as ResourceModel

describe('navFromMeta', () => {
  it('lists only resources with a view and honours nav.hidden', () => {
    const view = (resource: string, extra = {}) => ({ resource, fields: {}, filters: [], layout: [], actions: [], ...extra }) as unknown as ViewModel
    const meta = {
      etag: '"x"',
      appName: 'Protobase',
      permissions: {},
      pages: {},
      resources: { orders: model('orders', 'sales'), orderLines: model('orderLines', 'sales'), audit: model('audit', 'core') },
      views: { orders: view('orders'), orderLines: view('orderLines', { nav: { hidden: true } }) },
    }
    expect(navFromMeta(meta).flatMap((group) => group.items.map((item) => item.id))).toEqual(['orders'])
  })

  it('gives each named list an entry of its own, placed by its own nav', () => {
    const named = (name: string, extra = {}) => ({ name, names: { singular: name, plural: `The ${name}` }, filters: [], ...extra })
    const view = (extra = {}) =>
      ({ resource: 'changelog', fields: {}, filters: [], layout: [], actions: [], lists: [named('updates', { nav: { group: 'History', order: 1 } }), named('hidden', { nav: { hidden: true } })], ...extra }) as unknown as ViewModel
    const meta = (extra = {}) => ({ etag: '"x"', appName: 'Protobase', permissions: {}, pages: {}, resources: { changelog: model('changelog', 'core') }, views: { changelog: view(extra) } })
    const items = (groups: ReturnType<typeof navFromMeta>) => groups.flatMap((group) => group.items.map((item) => [group.label, item.id, item.label, item.href]))
    expect(items(navFromMeta(meta(), '/admin'))).toEqual([
      ['Admin', 'changelog', 'Changelog', '/admin/changelog'],
      ['History', 'changelog/updates', 'The updates', '/admin/changelog?list=updates'],
    ])
    expect(items(navFromMeta(meta({ nav: { hidden: true } }), '/admin'))).toEqual([['History', 'changelog/updates', 'The updates', '/admin/changelog?list=updates']])
  })

  it("lists the resources of a source that cannot be read under its label, each with the problem, and none while it loads", () => {
    const view = (resource: string) => ({ resource, fields: {}, filters: [], layout: [], actions: [] }) as unknown as ViewModel
    const desk = { url: 'https://desk.example.com/api/v1', label: 'Service desk', resources: ['tickets', 'ticket_notes'] }
    const cloud = { url: 'https://cloud.example.com/api/v1', label: 'Cloud', resources: ['tasks'] }
    const meta = {
      etag: '"x"',
      appName: 'Protobase',
      permissions: {},
      pages: {},
      resources: { orders: model('orders', 'sales') },
      views: { orders: view('orders') },
      sources: [{ source: desk, state: 'error' as const, error: new Error('down') }, { source: cloud, state: 'loading' as const }],
    }
    const groups = navFromMeta(meta, '/admin')
    expect(groups.map((group) => group.label)).toEqual(['Sales', 'Service desk'])
    expect(groups[1]!.items.map((item) => [item.label, item.href, item.problem])).toEqual([
      ['Tickets', '/admin/tickets', 'Cannot reach Service desk'],
      ['Ticket notes', '/admin/ticket_notes', 'Cannot reach Service desk'],
    ])
  })

  it("lists the resources a visitor is asked to sign in for where their views place them, and under Account without a place", () => {
    const view = (resource: string) => ({ resource, fields: {}, filters: [], layout: [], actions: [] }) as unknown as ViewModel
    const prompt = { title: 'Sign in', description: 'To keep them.' }
    const meta = {
      etag: '"x"',
      appName: 'Protobase',
      permissions: {},
      pages: {},
      resources: { listings: model('listings', 'market') },
      views: { listings: { ...view('listings'), nav: { group: 'Browse' } } },
      signIn: {
        favorites: { resource: 'favorites', names: { singular: 'Favorite', plural: 'Favorites' }, nav: { group: 'Browse', order: 0 }, signIn: prompt },
        alerts: { resource: 'alerts', signIn: prompt },
        notes: { resource: 'notes', nav: { hidden: true }, signIn: prompt },
      },
    }
    expect(navFromMeta(meta, '/app').map((group) => [group.label, group.items.map((item) => [item.label, item.href])])).toEqual([
      ['Browse', [['Favorites', '/app/favorites'], ['Listings', '/app/listings']]],
      ['Account', [['Alerts', '/app/alerts']]],
    ])
  })

  it('honours nav group and order', () => {
    const view = (resource: string, nav: object) => ({ resource, fields: {}, filters: [], layout: [], actions: [], nav }) as unknown as ViewModel
    const meta = {
      etag: '"x"',
      appName: 'Protobase',
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
      appName: 'Protobase',
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

  it('shows the default public schema without a group name', () => {
    const meta = {
      etag: '"x"',
      appName: 'Protobase',
      permissions: {},
      pages: {},
      resources: { tenants: model('tenants', 'public'), orders: model('orders', 'sales') },
      views: {
        tenants: { resource: 'tenants', fields: {}, filters: [], layout: [], actions: [] } as ViewModel,
        orders: { resource: 'orders', fields: {}, filters: [], layout: [], actions: [] } as ViewModel,
      },
    }
    expect(navFromMeta(meta).map((group) => group.label)).toEqual(['', 'Sales'])
  })

  it('leaves user menu resources out and attaches recent records', () => {
    const view = (resource: string) => ({ resource, fields: {}, filters: [], layout: [], actions: [] }) as unknown as ViewModel
    const meta = {
      etag: '"x"',
      appName: 'Protobase',
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
      appName: 'Protobase',
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
    const meta = { etag: '"x"', appName: 'Protobase', permissions: {}, resources: {}, views: {}, pages: { overview: page('overview'), billing: page('billing') }, userMenu: { items: [{ kind: 'page' as const, page: 'billing' }] } }
    expect(navFromMeta(meta).flatMap((group) => group.items.map((item) => item.id))).toEqual(['overview'])
  })
})
