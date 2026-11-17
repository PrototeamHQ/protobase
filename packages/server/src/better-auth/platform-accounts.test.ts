import { describe, expect, it } from 'vitest'
import { connectsHiddenAccount, disconnectsHiddenAccount, holdsOtherSubject } from './platform-accounts'

describe('holdsOtherSubject', () => {
  it("counts the person's accounts of the provider but the one with this subject, in the store", async () => {
    const asked: unknown[] = []
    const adapter = { count: async (input: unknown) => (asked.push(input), 1) }
    expect(await holdsOtherSubject({ adapter }, { userId: 'user-1', providerId: 'central', accountId: '5151' })).toBe(true)
    expect(asked).toEqual([{ model: 'account', where: [{ field: 'userId', value: 'user-1' }, { field: 'providerId', value: 'central' }, { field: 'accountId', operator: 'ne', value: '5151' }] }])
    expect(await holdsOtherSubject({ adapter: { count: async () => 0 } }, { userId: 'user-1', providerId: 'central', accountId: '4242' })).toBe(false)
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
  it("is one of the person's own accounts of one of the providers", () => {
    expect(disconnectsHiddenAccount({ providerId: 'console' }, ['console'])).toBe(true)
  })

  it('is not an account of another provider, nor one the person does not have', () => {
    expect(disconnectsHiddenAccount({ providerId: 'github' }, ['console'])).toBe(false)
    expect(disconnectsHiddenAccount(null, ['console'])).toBe(false)
  })
})
