import { describe, expect, it } from 'vitest'
import { breadcrumbFor } from './breadcrumb-for'

describe('breadcrumbFor', () => {
  it('links the list and the record, and leaves the group as text', () => {
    expect(breadcrumbFor({ basePath: '/admin', route: { resource: 'tenants', key: '7' }, group: 'Leasing', resourceLabel: 'Tenants', recordTitle: 'Ada Visser' })).toEqual([
      'Leasing',
      { label: 'Tenants', href: '/admin/tenants' },
      { label: 'Ada Visser', href: '/admin/tenants/7' },
    ])
  })

  it('ends with the list on a list page', () => {
    expect(breadcrumbFor({ basePath: '', route: { resource: 'tenants' }, group: 'Leasing', resourceLabel: 'Tenants' })).toEqual(['Leasing', { label: 'Tenants', href: '/tenants' }])
  })

  it('names the create page "New"', () => {
    expect(breadcrumbFor({ basePath: '', route: { resource: 'tenants', key: 'new' }, resourceLabel: 'Tenants' })).toEqual([{ label: 'Tenants', href: '/tenants' }, { label: 'New', href: '/tenants/new' }])
  })

  it('falls back to the key and encodes composite keys', () => {
    expect(breadcrumbFor({ basePath: '', route: { resource: 'leaseTenants', key: '3,7' }, resourceLabel: 'Lease tenants' }).at(-1)).toEqual({ label: '3,7', href: '/leaseTenants/3%2C7' })
  })

  it('links a composed page', () => {
    expect(breadcrumbFor({ basePath: '/admin', route: { resource: 'overview' }, group: 'Pages', page: { name: 'overview', title: 'Overview' } })).toEqual(['Pages', { label: 'Overview', href: '/admin/overview' }])
  })

  it('shows "Admin" before a resource is chosen', () => {
    expect(breadcrumbFor({ basePath: '', route: {} })).toEqual(['Admin'])
  })
})
