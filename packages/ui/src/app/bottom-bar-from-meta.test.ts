import { ExternalLink, LayoutDashboard, LifeBuoy, Receipt, Table2, Warehouse } from 'lucide-react'
import { describe, expect, it } from 'vitest'
import type { ResourceModel, ViewModel } from '@protobase/schema'
import type { MetaData } from '../data/meta-data'
import { bottomBarFromMeta } from './bottom-bar-from-meta'

const tree = { type: 'Page', props: { title: 'Overview' }, children: [] }

const meta = {
  etag: '"x"',
  appName: 'Protobase',
  permissions: {},
  resources: { orders: { name: 'orders' } as ResourceModel, locations: { name: 'locations' } as ResourceModel },
  views: { locations: { resource: 'locations', icon: 'warehouse' } as ViewModel },
  pages: { overview: { name: 'overview', title: 'Overview', icon: 'receipt', tree } },
  bottomBar: {
    label: 'Sales',
    items: [
      { kind: 'resource', resource: 'orders', label: 'Orders' },
      { kind: 'page', page: 'overview', label: 'Today' },
      { kind: 'page', page: 'plain', label: 'Plain' },
      { kind: 'link', label: 'Help', href: 'https://help.example.test', icon: 'life-buoy' },
      { kind: 'link', label: 'Status', href: 'https://status.example.test' },
      { kind: 'resource', resource: 'locations', label: 'Locations' },
    ],
  },
} satisfies MetaData

describe('bottomBarFromMeta', () => {
  it('opens resources and pages in the app, under their own labels, and links in a new tab; a resource has its view\'s icon, else a table', () => {
    expect(bottomBarFromMeta(meta, '/admin', 'overview')).toEqual([
      { id: 'orders', label: 'Orders', icon: Table2, href: '/admin/orders', active: false },
      { id: 'overview', label: 'Today', icon: Receipt, href: '/admin/overview', active: true },
      { id: 'plain', label: 'Plain', icon: LayoutDashboard, href: '/admin/plain', active: false },
      { id: 'link-3', label: 'Help', icon: LifeBuoy, href: 'https://help.example.test', external: true },
      { id: 'link-4', label: 'Status', icon: ExternalLink, href: 'https://status.example.test', external: true },
      { id: 'locations', label: 'Locations', icon: Warehouse, href: '/admin/locations', active: false },
    ])
  })

  it('is empty without a bottom bar', () => {
    expect(bottomBarFromMeta({ ...meta, bottomBar: undefined }, '', undefined)).toEqual([])
  })
})
