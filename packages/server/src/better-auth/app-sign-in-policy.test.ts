import { describe, expect, it } from 'vitest'
import { appSignInPolicy } from './app-sign-in-policy'
import { defaultSignInPolicy, type SignInPolicy } from './sign-in-policy'

describe('appSignInPolicy', () => {
  it('is everything allowed when the app sets nothing', () => {
    expect(appSignInPolicy()).toEqual(defaultSignInPolicy)
  })

  it('changes only the methods the app names', () => {
    expect(appSignInPolicy({ password: 'forbidden', staffAccess: 'forbidden' })).toEqual({ ...defaultSignInPolicy, password: 'forbidden', staffAccess: 'forbidden' })
  })

  it('refuses a rule a method does not take', () => {
    expect(() => appSignInPolicy({ password: 'required' } as unknown as Partial<SignInPolicy>)).toThrow(/choose one of the offered rules/)
  })

  it('refuses a policy an admin could not save', () => {
    expect(() => appSignInPolicy({ password: 'forbidden', emailCode: 'forbidden' })).toThrow(/signInPolicy: Keep password or emailed-code sign-in on/)
    expect(() => appSignInPolicy({ password: 'forbidden', twoFactor: 'required' })).toThrow(/cannot be required while password sign-in is off/)
  })
})
