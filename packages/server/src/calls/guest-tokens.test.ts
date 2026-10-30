import { describe, expect, it } from 'vitest'
import { guestMember, guestTokenPrefix, isGuestMember, linkTokenPrefix, newToken, tokenHash } from './guest-tokens'

describe('guest tokens', () => {
  it('are 32 random bytes after their prefix, kept only as their hash', () => {
    const token = newToken(guestTokenPrefix)
    expect(token).toMatch(/^pbg_[A-Za-z0-9_-]{43}$/)
    expect(newToken(guestTokenPrefix)).not.toBe(token)
    expect(tokenHash(guestTokenPrefix, token)).toEqual(tokenHash(guestTokenPrefix, token))
    expect(tokenHash(guestTokenPrefix, token)!.length).toBe(32)
  })

  it('are no token of the other kind, nor any other value', () => {
    expect(tokenHash(linkTokenPrefix, newToken(guestTokenPrefix))).toBeUndefined()
    expect(tokenHash(guestTokenPrefix, newToken(linkTokenPrefix))).toBeUndefined()
    expect(tokenHash(guestTokenPrefix, 'pbg_short')).toBeUndefined()
    expect(tokenHash(guestTokenPrefix, undefined)).toBeUndefined()
    expect(tokenHash(guestTokenPrefix, 42)).toBeUndefined()
  })

  it('make a guest a member of their own form', () => {
    expect(guestMember('4b1f')).toBe('guest:4b1f')
    expect(isGuestMember('guest:4b1f')).toBe(true)
    expect(isGuestMember('ann')).toBe(false)
  })
})
