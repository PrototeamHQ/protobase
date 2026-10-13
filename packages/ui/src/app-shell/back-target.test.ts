import { describe, expect, it } from 'vitest'
import { backTarget } from './back-target'

describe('backTarget', () => {
  it('is the crumb just before the current page', () => {
    expect(backTarget(['Leasing', { label: 'Tenants', href: '/admin/tenants' }, { label: 'Acme', href: '/admin/tenants/1' }])).toEqual({ label: 'Tenants', href: '/admin/tenants' })
  })

  it('is none on a top-level page', () => {
    expect(backTarget([{ label: 'Tenants', href: '/admin/tenants' }])).toBeUndefined()
    expect(backTarget([])).toBeUndefined()
  })

  it('is none when the previous crumb has no page of its own', () => {
    expect(backTarget(['Leasing', { label: 'Tenants', href: '/admin/tenants' }])).toBeUndefined()
    expect(backTarget([{ label: 'Tenants' }, 'Acme'])).toBeUndefined()
  })

  it('is none while the previous crumb is still loading', () => {
    expect(backTarget([{ label: 'Loading record', href: '/admin/tenants/1', loading: true }, 'Edit'])).toBeUndefined()
  })
})
