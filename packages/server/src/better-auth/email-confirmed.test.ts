import { describe, expect, it } from 'vitest'
import { confirmedOnCreate, confirmedOnUpdate } from './email-confirmed'

const now = new Date('2026-08-01T00:00:00Z')
const imported = new Date('2025-01-01T00:00:00Z')

describe('the time an address was confirmed', () => {
  it('is now for an account created verified, and left out for one created unverified', () => {
    expect(confirmedOnCreate({ email: 'ann@example.com', emailVerified: true }, now)).toEqual({ email: 'ann@example.com', emailVerified: true, emailConfirmedAt: now })
    expect(confirmedOnCreate({ email: 'ann@example.com', emailVerified: false }, now)).toEqual({ email: 'ann@example.com', emailVerified: false })
    expect(confirmedOnCreate({ email: 'ann@example.com' }, now)).toEqual({ email: 'ann@example.com' })
  })

  it('is now when an update verifies the address', () => {
    expect(confirmedOnUpdate({ emailVerified: true }, now)).toEqual({ emailVerified: true, emailConfirmedAt: now })
  })

  it('is cleared when an update changes the address unverified, and left alone by other updates', () => {
    expect(confirmedOnUpdate({ email: 'new@example.com', emailVerified: false }, now)).toEqual({ email: 'new@example.com', emailVerified: false, emailConfirmedAt: null })
    expect(confirmedOnUpdate({ email: 'new@example.com' }, now)).toEqual({ email: 'new@example.com', emailConfirmedAt: null })
    expect(confirmedOnUpdate({ name: 'Ann' } as { name: string; email?: string }, now)).toEqual({ name: 'Ann' })
  })

  it('keeps a time the data gives itself, such as an import', () => {
    expect(confirmedOnCreate({ emailVerified: true, emailConfirmedAt: imported }, now)).toEqual({ emailVerified: true, emailConfirmedAt: imported })
    expect(confirmedOnUpdate({ emailVerified: true, emailConfirmedAt: imported }, now)).toEqual({ emailVerified: true, emailConfirmedAt: imported })
  })
})
