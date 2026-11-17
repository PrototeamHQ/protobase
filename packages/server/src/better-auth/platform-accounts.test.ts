import { describe, expect, it } from 'vitest'
import { changesHiddenAccount, holdsOtherSubject } from './platform-accounts'

describe('holdsOtherSubject', () => {
  const linked = [{ providerId: 'credential', accountId: 'user-1' }, { providerId: 'central', accountId: '4242' }]

  it('is an account of the same provider with another subject', () => {
    expect(holdsOtherSubject(linked, { providerId: 'central', accountId: '5151' })).toBe(true)
  })

  it('is not the same subject again, nor a provider the person has no account of', () => {
    expect(holdsOtherSubject(linked, { providerId: 'central', accountId: '4242' })).toBe(false)
    expect(holdsOtherSubject(linked, { providerId: 'oidc', accountId: '5151' })).toBe(false)
    expect(holdsOtherSubject([], { providerId: 'central', accountId: '5151' })).toBe(false)
  })
})

describe('changesHiddenAccount', () => {
  it('is connecting or disconnecting an account of one of the providers', () => {
    expect(changesHiddenAccount('/link-social', { provider: 'console', callbackURL: '/' }, ['console'])).toBe(true)
    expect(changesHiddenAccount('/unlink-account', { providerId: 'console', accountId: '4242' }, ['console'])).toBe(true)
  })

  it('is not another provider, signing in with it, or another path', () => {
    expect(changesHiddenAccount('/link-social', { provider: 'github' }, ['console'])).toBe(false)
    expect(changesHiddenAccount('/unlink-account', { providerId: 'github' }, ['console'])).toBe(false)
    expect(changesHiddenAccount('/sign-in/social', { provider: 'console' }, ['console'])).toBe(false)
    expect(changesHiddenAccount(undefined, undefined, ['console'])).toBe(false)
  })
})
