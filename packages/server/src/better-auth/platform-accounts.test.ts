import { describe, expect, it } from 'vitest'
import { connectsHiddenAccount, disconnectsHiddenAccount, holdsOtherSubject } from './platform-accounts'

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

describe('connectsHiddenAccount', () => {
  it('is connecting an account of one of the providers, and nothing else', () => {
    expect(connectsHiddenAccount('/link-social', { provider: 'console', callbackURL: '/' }, ['console'])).toBe(true)
    expect(connectsHiddenAccount('/link-social', { provider: 'github' }, ['console'])).toBe(false)
    expect(connectsHiddenAccount('/sign-in/social', { provider: 'console' }, ['console'])).toBe(false)
    expect(connectsHiddenAccount(undefined, undefined, ['console'])).toBe(false)
  })
})

describe('disconnectsHiddenAccount', () => {
  const linked = [{ id: 'row-1', providerId: 'console' }, { id: 'row-2', providerId: 'github' }]

  it("is disconnecting one of the person's accounts of one of the providers, by its id alone", () => {
    expect(disconnectsHiddenAccount(linked, 'row-1', ['console'])).toBe(true)
  })

  it('is not an account of another provider, nor one that is not theirs', () => {
    expect(disconnectsHiddenAccount(linked, 'row-2', ['console'])).toBe(false)
    expect(disconnectsHiddenAccount(linked, 'row-3', ['console'])).toBe(false)
    expect(disconnectsHiddenAccount(linked, undefined, ['console'])).toBe(false)
  })
})
