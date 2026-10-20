import { describe, expect, it } from 'vitest'
import { defaultSignInPolicy } from './sign-in-policy'
import { missingSetup } from './sign-in-setup'
import { fakeContext } from './testing/fake-adapter'

const policy = (changes: object) => ({ signInPolicy: [{ id: 'p1', ...defaultSignInPolicy, ...changes, createdAt: new Date() }] })

describe('the setup the sign-in policy still asks of someone', () => {
  it('is nothing under the default policy', async () => {
    const { context } = fakeContext()
    expect(await missingSetup(context, { id: 'ana' }, { mail: true })).toEqual([])
  })

  it('is two-factor authentication and a passkey while required and not set up', async () => {
    const { context } = fakeContext(policy({ twoFactor: 'required', passkey: 'required' }))
    expect(await missingSetup(context, { id: 'ana', twoFactorEnabled: false }, { mail: true })).toEqual(['twoFactor', 'passkey'])
  })

  it('is nothing once they are set up', async () => {
    const { context } = fakeContext({ ...policy({ twoFactor: 'required', passkey: 'required' }), passkey: [{ id: 'k1', userId: 'ana' }] })
    expect(await missingSetup(context, { id: 'ana', twoFactorEnabled: true }, { mail: true })).toEqual([])
  })
})
