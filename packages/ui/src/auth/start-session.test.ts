import { describe, expect, it } from 'vitest'
import type { AuthUser, SetupStatus } from '@protobase/client'
import { keepsStartCache, startCacheStep } from './start-session'

const status = { needsAdmin: false, signInMethods: ['password'], passwordReset: false, socialProviders: [], samlProviders: [] } satisfies SetupStatus
const user = { id: 'u1', email: 'ada@example.com', name: 'Ada' } as AuthUser

describe('what the start cache keeps of the auth state', () => {
  it('keeps the session of someone signed in as themselves', () => {
    expect(startCacheStep({ kind: 'signed-in', user }, status)).toEqual({ save: { user, status } })
    expect(keepsStartCache({ kind: 'signed-in', user })).toBe(true)
  })

  it('forgets everything on signing out, which a 401 does too', () => {
    expect(startCacheStep({ kind: 'signed-out' }, status)).toBe('clear')
  })

  it('keeps nothing for a visitor', () => {
    expect(startCacheStep({ kind: 'visitor' }, status)).toBe('clear')
    expect(keepsStartCache({ kind: 'visitor' })).toBe(false)
  })

  it('keeps nothing for staff signed in as someone', () => {
    const staff = { kind: 'signed-in' as const, user, staff: { provider: 'Operator', email: 'staff@example.com' } as never }
    expect(startCacheStep(staff, status)).toBe('clear')
    expect(keepsStartCache(staff)).toBe(false)
  })

  it('forgets everything when the sign-in needs another step', () => {
    expect(startCacheStep({ kind: 'two-factor', methods: ['totp'] }, status)).toBe('clear')
    expect(startCacheStep({ kind: 'setup-required', user, missing: ['two-factor'] as never }, status)).toBe('clear')
  })

  it('is left alone while the state loads or the server cannot be asked', () => {
    expect(startCacheStep({ kind: 'loading' }, status)).toBe('leave')
    expect(startCacheStep({ kind: 'error', message: 'offline' }, status)).toBe('leave')
  })
})
