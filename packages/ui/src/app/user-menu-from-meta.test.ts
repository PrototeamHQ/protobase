import { Building2, CreditCard, ExternalLink, LayoutDashboard, LifeBuoy, Users } from 'lucide-react'
import { describe, expect, it } from 'vitest'
import type { ResourceModel, ViewModel } from '@protobase/schema'
import type { MetaData } from '../data/meta-data'
import { userMenuFromMeta, userMenuResources } from './user-menu-from-meta'

const meta = {
  etag: '"x"',
  permissions: {},
  resources: { users: { name: 'users' } as ResourceModel, organizations: { name: 'organizations' } as ResourceModel },
  views: { users: { resource: 'users', names: { singular: 'Member', plural: 'Team members' } } as ViewModel },
  pages: {},
  userMenu: {
    items: [
      { kind: 'resource', resource: 'organizations', label: 'Organization', icon: 'building' },
      { kind: 'resource', resource: 'users' },
      { kind: 'link', label: 'Support', href: 'mailto:help@example.test', icon: 'life-buoy' },
      { kind: 'link', label: 'Status', href: 'https://status.example.test', icon: 'no-such-icon' },
    ],
  },
} satisfies MetaData

describe('userMenuFromMeta', () => {
  it('turns resources into in-app pages and links into new tabs', () => {
    expect(userMenuFromMeta(meta, '/admin', 'users')).toEqual([
      { id: 'organizations', label: 'Organization', icon: Building2, href: '/admin/organizations', active: false },
      { id: 'users', label: 'Team members', icon: Users, href: '/admin/users', active: true },
      { id: 'link-2', label: 'Support', icon: LifeBuoy, href: 'mailto:help@example.test', external: true },
      { id: 'link-3', label: 'Status', icon: ExternalLink, href: 'https://status.example.test', external: true },
    ])
  })

  it('is empty without a user menu', () => {
    expect(userMenuFromMeta({ ...meta, userMenu: undefined }, '', undefined)).toEqual([])
  })

  it('opens pages in the app, named by their title unless the item has a label', () => {
    const tree = { type: 'Page', props: { title: 'Billing' }, children: [] }
    const withPages = { ...meta, pages: { billing: { name: 'billing', title: 'Billing', icon: 'credit-card', tree } }, userMenu: { items: [{ kind: 'page' as const, page: 'billing' }, { kind: 'page' as const, page: 'support', label: 'Help' }] } }
    expect(userMenuFromMeta(withPages, '', 'billing')).toEqual([
      { id: 'billing', label: 'Billing', icon: CreditCard, href: '/billing', active: true },
      { id: 'support', label: 'Help', icon: LayoutDashboard, href: '/support', active: false },
    ])
    expect([...userMenuResources(withPages)]).toEqual(['billing', 'support'])
  })

  it('names the resources it holds', () => {
    expect([...userMenuResources(meta)]).toEqual(['organizations', 'users'])
  })
})
