import { describe, expect, it } from 'vitest'
import { isPoliced, policyRefusal } from './sign-in-enforcement'
import { defaultSignInPolicy, type SignInPolicy } from './sign-in-policy'

const policy = (changes: Partial<SignInPolicy>): SignInPolicy => ({ ...defaultSignInPolicy, ...changes })
const code = (refusal: ReturnType<typeof policyRefusal>) => refusal?.code

describe('policyRefusal', () => {
  it('lets everything through under the default policy', () => {
    for (const path of ['/sign-in/email', '/sign-in/email-otp', '/passkey/verify-authentication', '/two-factor/enable', '/two-factor/disable', '/token']) {
      expect(policyRefusal(defaultSignInPolicy, { path })).toBeUndefined()
    }
  })

  it('refuses password sign-in and password reset while passwords are off', () => {
    const off = policy({ password: 'forbidden' })
    for (const path of ['/sign-in/email', '/request-password-reset', '/reset-password', '/reset-password/:token']) {
      expect(policyRefusal(off, { path })).toEqual({ code: 'SIGN_IN_METHOD_FORBIDDEN', message: 'Signing in with a password is turned off.' })
    }
    expect(policyRefusal(off, { path: '/sign-in/email-otp' })).toBeUndefined()
  })

  it('refuses sending and using sign-in codes while emailed codes are off', () => {
    const off = policy({ emailCode: 'forbidden' })
    expect(policyRefusal(off, { path: '/sign-in/email-otp' })?.message).toBe('Signing in with an emailed code is turned off.')
    expect(code(policyRefusal(off, { path: '/email-otp/send-verification-otp', body: { email: 'a@example.com', type: 'sign-in' } }))).toBe('SIGN_IN_METHOD_FORBIDDEN')
    expect(policyRefusal(off, { path: '/sign-in/email' })).toBeUndefined()
  })

  it('refuses signing in with and adding passkeys while passkeys are off, but not removing one', () => {
    const off = policy({ passkey: 'forbidden' })
    for (const path of ['/passkey/generate-authenticate-options', '/passkey/verify-authentication', '/passkey/generate-register-options', '/passkey/verify-registration']) {
      expect(code(policyRefusal(off, { path }))).toBe('SIGN_IN_METHOD_FORBIDDEN')
    }
    expect(policyRefusal(off, { path: '/passkey/delete-passkey' })).toBeUndefined()
  })

  it('refuses turning two-factor authentication on while it is off, and off while it is required', () => {
    expect(code(policyRefusal(policy({ twoFactor: 'forbidden' }), { path: '/two-factor/enable' }))).toBe('SIGN_IN_METHOD_FORBIDDEN')
    // Someone who turned it on earlier still finishes signing in with it.
    expect(policyRefusal(policy({ twoFactor: 'forbidden' }), { path: '/two-factor/verify-totp' })).toBeUndefined()
    expect(policyRefusal(policy({ twoFactor: 'forbidden' }), { path: '/two-factor/disable' })).toBeUndefined()
    expect(code(policyRefusal(policy({ twoFactor: 'required' }), { path: '/two-factor/disable' }))).toBe('TWO_FACTOR_REQUIRED')
    expect(policyRefusal(policy({ twoFactor: 'required' }), { path: '/two-factor/enable' })).toBeUndefined()
  })
})

describe('isPoliced', () => {
  it('names the endpoints the policy can refuse, and leaves the rest alone', () => {
    for (const path of ['/sign-in/email', '/reset-password/:token', '/sign-in/email-otp', '/email-otp/send-verification-otp', '/passkey/verify-authentication', '/passkey/delete-passkey', '/two-factor/disable', '/token']) {
      expect(isPoliced(path)).toBe(true)
    }
    for (const path of ['/get-session', '/sign-out', '/two-factor/verify-totp', '/passkey/list-user-passkeys', '/jwks', undefined]) expect(isPoliced(path)).toBe(false)
  })
})
