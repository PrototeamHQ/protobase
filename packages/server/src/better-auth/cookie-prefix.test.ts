import { describe, expect, it } from 'vitest'
import { cookiePrefixOf } from './cookie-prefix'

describe('cookiePrefixOf', () => {
  it('names the port of an http app, so two local apps keep their own sessions', () => {
    expect(cookiePrefixOf('http://localhost:5173')).toBe('better-auth-5173')
    expect(cookiePrefixOf('http://localhost:5174/')).toBe('better-auth-5174')
  })

  it("keeps Better Auth's names on https and on an http address without a port", () => {
    expect(cookiePrefixOf('https://admin.example.com')).toBe('better-auth')
    expect(cookiePrefixOf('https://localhost:8443')).toBe('better-auth')
    expect(cookiePrefixOf('http://localhost')).toBe('better-auth')
  })
})
