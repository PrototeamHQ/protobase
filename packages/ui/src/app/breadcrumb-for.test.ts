import { describe, expect, it } from 'vitest'
import { breadcrumbFor } from './breadcrumb-for'
import type { ListAddress } from './current-address'

const list = (resource: string): ListAddress => ({ kind: 'list', resource, display: 'table', filter: '', orderBy: 'id asc', filterLayout: 'bar' })

describe('breadcrumbFor', () => {
  it('links the list and the record, and leaves the group as text', () => {
    expect(breadcrumbFor({ basePath: '/admin', address: { kind: 'record', resource: 'tenants', key: '7' }, group: 'Leasing', resourceLabel: 'Tenants', recordTitle: 'Ada Visser' })).toEqual([
      'Leasing',
      { label: 'Tenants', href: '/admin/tenants' },
      { label: 'Ada Visser', href: '/admin/tenants/7' },
    ])
  })

  it('ends with the list on a list page, without its filter or order', () => {
    expect(breadcrumbFor({ basePath: '', address: { ...list('tenants'), filter: 'city = "Utrecht"' }, group: 'Leasing', resourceLabel: 'Tenants' })).toEqual(['Leasing', { label: 'Tenants', href: '/tenants' }])
  })

  it('keeps a named list in the link to the list', () => {
    expect(breadcrumbFor({ basePath: '', address: { ...list('changelog'), list: 'updates' }, resourceLabel: 'Updates' })).toEqual([{ label: 'Updates', href: '/changelog?list=updates' }])
  })

  it('names the create page "New"', () => {
    expect(breadcrumbFor({ basePath: '', address: { kind: 'create', resource: 'tenants' }, resourceLabel: 'Tenants' })).toEqual([{ label: 'Tenants', href: '/tenants' }, { label: 'New', href: '/tenants/new' }])
  })

  it('falls back to the key and encodes composite keys', () => {
    expect(breadcrumbFor({ basePath: '', address: { kind: 'record', resource: 'leaseTenants', key: '3,7' }, resourceLabel: 'Lease tenants' }).at(-1)).toEqual({ label: '3,7', href: '/leaseTenants/3%2C7' })
  })

  it('shows a loading crumb, still linked, while the record has no title yet', () => {
    expect(breadcrumbFor({ basePath: '', address: { kind: 'record', resource: 'tenants', key: '7' }, resourceLabel: 'Tenants', recordLoading: true }).at(-1)).toEqual({ label: 'Loading record', href: '/tenants/7', loading: true })
  })

  it('shows the title once the record has loaded', () => {
    expect(breadcrumbFor({ basePath: '', address: { kind: 'record', resource: 'tenants', key: '7' }, resourceLabel: 'Tenants', recordTitle: 'Ada Visser', recordLoading: false }).at(-1)).toEqual({ label: 'Ada Visser', href: '/tenants/7' })
  })

  it('links a composed page', () => {
    expect(breadcrumbFor({ basePath: '/admin', address: { kind: 'page', page: 'overview' }, group: 'Pages', page: { name: 'overview', title: 'Overview' } })).toEqual(['Pages', { label: 'Overview', href: '/admin/overview' }])
  })

  it('shows "Admin" before a resource is chosen', () => {
    expect(breadcrumbFor({ basePath: '', address: undefined })).toEqual(['Admin'])
  })
})
