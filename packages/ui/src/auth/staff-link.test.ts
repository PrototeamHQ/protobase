import { describe, expect, it } from 'vitest'
import { readStaffLink, withoutStaffLink } from './staff-link'

describe('staff links', () => {
  it('open the staff sign-in page with the person and the reason filled in', () => {
    expect(readStaffLink('https://admin.example.com/?staff-sign-in&email=sanne%40example.com&reason=Ticket+4211')).toEqual({ email: 'sanne@example.com', reason: 'Ticket 4211' })
    expect(readStaffLink('https://admin.example.com/orders?staff-sign-in')).toEqual({ email: '', reason: '' })
  })

  it('open it again with the error the callback came back with', () => {
    expect(readStaffLink('https://admin.example.com/?staff-error=STAFF_SIGN_IN_NOT_STRONG')).toEqual({ email: '', reason: '', error: 'STAFF_SIGN_IN_NOT_STRONG' })
  })

  it('leave other pages alone, whatever their query', () => {
    expect(readStaffLink('https://admin.example.com/customers?email=sanne%40example.com')).toBeUndefined()
    expect(readStaffLink('https://admin.example.com/')).toBeUndefined()
  })

  it('leave the address bar as it was, with the query of the page itself', () => {
    expect(withoutStaffLink('https://admin.example.com/admin/?staff-sign-in&email=a%40b.c&reason=why#top')).toBe('/admin/#top')
    expect(withoutStaffLink('https://admin.example.com/customers?email=a%40b.c&staff-error=STAFF_SIGN_IN_FAILED')).toBe('/customers?email=a%40b.c')
  })
})
