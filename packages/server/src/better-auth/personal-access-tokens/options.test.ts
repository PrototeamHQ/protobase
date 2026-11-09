import { describe, expect, it } from 'vitest'
import { resolvePersonalAccessTokens } from './options'

describe('auth.personalAccessTokens', () => {
  it('takes a prefix of lowercase letters, digits and underscores ending in _', () => {
    expect(resolvePersonalAccessTokens({ prefix: 'invoices_' })).toEqual({ prefix: 'invoices_' })
    expect(resolvePersonalAccessTokens({ prefix: 'pb_erp2_' })).toEqual({ prefix: 'pb_erp2_' })
  })

  it('stops the server without a prefix, naming it', () => {
    expect(() => resolvePersonalAccessTokens({})).toThrow('auth.personalAccessTokens needs a prefix')
    expect(() => resolvePersonalAccessTokens(true)).toThrow("auth.personalAccessTokens takes an object with the tokens' prefix")
  })

  it('stops the server with a prefix that is not lowercase letters, digits and underscores ending in _', () => {
    for (const prefix of ['invoices', 'Invoices_', 'in-voices_', 'in voices_', '_', '', 7]) {
      expect(() => resolvePersonalAccessTokens({ prefix })).toThrow(`auth.personalAccessTokens.prefix ${JSON.stringify(prefix)} is not lowercase letters, digits and underscores ending in _`)
    }
  })

  it('refuses a setting it does not know', () => {
    expect(() => resolvePersonalAccessTokens({ prefix: 'invoices_', scopes: ['read'] })).toThrow('takes only a prefix, not scopes')
  })
})
