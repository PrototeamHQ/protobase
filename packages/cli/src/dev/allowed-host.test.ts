import { describe, expect, it } from 'vitest'
import { isAllowedHost } from './allowed-host'

describe('isAllowedHost', () => {
  it('passes what Vite passes without a list', () => {
    for (const host of [undefined, '127.0.0.1:5173', '[::1]:5173', 'localhost:5173', 'app.localhost']) expect(isAllowedHost(host, [])).toBe(true)
  })

  it('passes a listed name, and an entry starting with a dot for itself and its subdomains', () => {
    expect(isAllowedHost('dev.example.com:5173', ['dev.example.com'])).toBe(true)
    expect(isAllowedHost('example.com', ['.example.com'])).toBe(true)
    expect(isAllowedHost('a.b.example.com', ['.example.com'])).toBe(true)
  })

  it('refuses any other name, and a broken IPv6 literal', () => {
    expect(isAllowedHost('evil.example', ['dev.example.com'])).toBe(false)
    expect(isAllowedHost('notexample.com', ['.example.com'])).toBe(false)
    expect(isAllowedHost('sub.dev.example.com', ['dev.example.com'])).toBe(false)
    expect(isAllowedHost('[nope]', [])).toBe(false)
  })

  it('passes everything with allowedHosts true', () => {
    expect(isAllowedHost('evil.example', true)).toBe(true)
  })
})
