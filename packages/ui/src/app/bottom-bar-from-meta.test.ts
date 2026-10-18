import { ExternalLink, LayoutDashboard, LifeBuoy, Receipt } from 'lucide-react'
import { describe, expect, it } from 'vitest'
import type { ResourceModel } from '@protobase/schema'
import type { MetaData } from '../data/meta-data'
import { bottomBarFromMeta } from './bottom-bar-from-meta'
import { iconFor } from './icons'

const tree = { type: 'Page', props: { title: 'Overview' }, children: [] }

const meta = {
  etag: '"x"',
  appName: 'Protobase',
  permissions: {},
  resources: { orders: { name: 'orders' } as ResourceModel },
  views: {},
  pages: { overview: { name: 'overview', title: 'Overview', icon: 'receipt', tree } },
  bottomBar: {
    label: 'Sales',
    items: [
      { kind: 'resource', resource: 'orders', label: 'Orders' },
      { kind: 'page', page: 'overview', label: 'Today' },
      { kind: 'page', page: 'plain', label: 'Plain' },
      { kind: 'link', label: 'Help', href: 'https://help.example.test', icon: 'life-buoy' },
      { kind: 'link', label: 'Status', href: 'https://status.example.test' },
    ],
  },
} satisfies MetaData

describe('bottomBarFromMeta', () => {
  it('opens resources and pages in the app, under their own labels, and links in a new tab', () => {
    expect(bottomBarFromMeta(meta, '/admin', 'overview')).toEqual([
      { id: 'orders', label: 'Orders', icon: iconFor('orders'), href: '/admin/orders', active: false },
      { id: 'overview', label: 'Today', icon: Receipt, href: '/admin/overview', active: true },
      { id: 'plain', label: 'Plain', icon: LayoutDashboard, href: '/admin/plain', active: false },
      { id: 'link-3', label: 'Help', icon: LifeBuoy, href: 'https://help.example.test', external: true },
      { id: 'link-4', label: 'Status', icon: ExternalLink, href: 'https://status.example.test', external: true },
    ])
  })

  it('is empty without a bottom bar', () => {
    expect(bottomBarFromMeta({ ...meta, bottomBar: undefined }, '', undefined)).toEqual([])
  })
})
