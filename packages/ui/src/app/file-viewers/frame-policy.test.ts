import { describe, expect, it } from 'vitest'
import { frameCsp, frameNonce, frameSandbox } from './frame-policy'

describe('frame policy', () => {
  it('sandboxes the page to an opaque origin with no way out, whatever it may run', () => {
    const flags = frameSandbox.split(' ')
    expect(flags).toEqual(['allow-scripts'])
    for (const flag of ['allow-same-origin', 'allow-top-navigation', 'allow-top-navigation-by-user-activation', 'allow-forms', 'allow-popups', 'allow-popups-to-escape-sandbox', 'allow-modals']) {
      expect(flags).not.toContain(flag)
    }
  })

  it("runs only the nonce's script in a page it does not trust, and loads nothing from the network", () => {
    const policy = frameCsp('bridge', 'abc')
    expect(policy).toContain("default-src 'none'")
    expect(policy).toContain("script-src 'nonce-abc'")
    expect(policy).toContain("base-uri 'none'")
    expect(policy).toContain("form-action 'none'")
    expect(policy).not.toMatch(/'unsafe-(hashes|eval)'|script-src[^;]*'unsafe-inline'/)
    expect(policy).not.toMatch(/https?:|\*|'self'|blob:/)
  })

  it("runs a trusted page's inline scripts without a nonce, which would turn them off", () => {
    expect(frameCsp('trusted-page', 'abc')).toContain("script-src 'unsafe-inline';")
    expect(frameCsp('trusted-page', 'abc')).not.toContain('nonce')
  })

  it('makes a fresh 128-bit nonce each time', () => {
    expect(frameNonce()).toMatch(/^[0-9a-f]{32}$/)
    expect(frameNonce()).not.toBe(frameNonce())
  })
})
