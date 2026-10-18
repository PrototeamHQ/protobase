import { describe, expect, it } from 'vitest'
import type { PageModel } from '@protobase/layout'
import type { ResourceModel, ViewModel } from '@protobase/schema'
import type { MetaData } from '../../data/meta-data'
import { navigationHits } from './navigation-hits'

const model = (name: string) => ({ name, table: { name, schema: 'sales' }, primaryKey: ['id'], fields: {} }) as unknown as ResourceModel
const view = (resource: string, singular: string, plural: string, extra: Partial<ViewModel> = {}) => ({ resource, fields: {}, filters: [], layout: [], actions: [], names: { singular, plural }, ...extra }) as ViewModel
const page = (name: string, title: string) => ({ name, title, blocks: [] }) as unknown as PageModel
const readOnly = { read: true, create: false, update: false, delete: false, conditional: [] }

const meta: MetaData = {
  etag: '"x"',
  appName: 'ERP',
  resources: { orders: model('orders'), stock_levels: model('stock_levels'), audit_log: model('audit_log') },
  views: { orders: view('orders', 'Order', 'Orders'), stock_levels: view('stock_levels', 'Stock level', 'Stock levels'), audit_log: view('audit_log', 'Entry', 'Audit log', { nav: { hidden: true } }) },
  pages: { overview: page('overview', 'Sales overview') },
  permissions: { stock_levels: readOnly },
}

const titles = (text: string) => navigationHits(meta, text).map((group) => [group.label, group.hits.map((hit) => hit.title)])

describe('navigationHits', () => {
  it("finds the sidebar's pages and lists by name, as links", () => {
    expect(titles('stock')).toEqual([['Go to', ['Stock levels']]])
    expect(titles('OVERVIEW')).toEqual([['Go to', ['Sales overview']]])
    expect(navigationHits(meta, 'stock', '/admin')[0]!.hits[0]!.href).toBe('/admin/stock_levels')
  })

  it('offers New for a resource the user may create, by its name or as "new ..."', () => {
    expect(titles('order')).toEqual([['Go to', ['Orders']], ['Create', ['New order']]])
    expect(titles('new ord')).toEqual([['Create', ['New order']]])
    expect(navigationHits(meta, 'new order')[0]!.hits[0]!.href).toBe('/orders/new')
  })

  it('leaves out what the user may not create, and what the sidebar hides', () => {
    expect(titles('new stock')).toEqual([])
    expect(titles('audit')).toEqual([])
    expect(titles('zzz')).toEqual([])
  })
})
