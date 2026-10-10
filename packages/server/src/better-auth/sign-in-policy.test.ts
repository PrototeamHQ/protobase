import { describe, expect, it } from 'vitest'
import { defaultSignInPolicy, effectiveSignInPolicy, missingRequiredMethods, parseSignInPolicy, signInPolicyProblem, type AccountMethods, type SignInPolicy } from './sign-in-policy'

const admin: AccountMethods = { password: true, passkeys: 0, twoFactor: false, authenticatorApp: false, socialSignIn: false }
const policy = (changes: Partial<SignInPolicy>): SignInPolicy => ({ ...defaultSignInPolicy, ...changes })

describe('parseSignInPolicy', () => {
  it('takes every method with a rule it offers, and drops anything else', () => {
    expect(parseSignInPolicy({ password: 'forbidden', emailCode: 'allowed', passkey: 'required', twoFactor: 'required', staffAccess: 'notify', platformSignIn: 'forbidden', extra: true })).toEqual({
      password: 'forbidden',
      emailCode: 'allowed',
      passkey: 'required',
      twoFactor: 'required',
      staffAccess: 'notify',
      platformSignIn: 'forbidden',
    })
  })

  it('refuses a missing method, an unknown rule, and "required" for a way to sign in that needs no setup', () => {
    expect(parseSignInPolicy({ password: 'allowed', emailCode: 'allowed', passkey: 'allowed' })).toBeUndefined()
    expect(parseSignInPolicy({ ...defaultSignInPolicy, passkey: 'sometimes' })).toBeUndefined()
    expect(parseSignInPolicy({ ...defaultSignInPolicy, password: 'required' })).toBeUndefined()
    expect(parseSignInPolicy({ ...defaultSignInPolicy, emailCode: 'required' })).toBeUndefined()
    expect(parseSignInPolicy({ ...defaultSignInPolicy, staffAccess: 'required' })).toBeUndefined()
    expect(parseSignInPolicy({ ...defaultSignInPolicy, passkey: 'notify' })).toBeUndefined()
    expect(parseSignInPolicy({ ...defaultSignInPolicy, platformSignIn: 'required' })).toBeUndefined()
    expect(parseSignInPolicy(null)).toBeUndefined()
    expect(parseSignInPolicy('allowed')).toBeUndefined()
  })
})

describe('effectiveSignInPolicy', () => {
  it('is the policy itself with mail on and nothing required', () => {
    const strict = policy({ password: 'forbidden', staffAccess: 'notify' })
    expect(effectiveSignInPolicy(strict, { mail: true })).toEqual(strict)
  })

  it('turns sign-in through the platform off while passkeys or two-factor authentication are required', () => {
    expect(effectiveSignInPolicy(policy({ passkey: 'required' }), { mail: true })).toEqual(policy({ passkey: 'required', platformSignIn: 'forbidden' }))
    expect(effectiveSignInPolicy(policy({ twoFactor: 'required' }), { mail: true }).platformSignIn).toBe('forbidden')
    expect(effectiveSignInPolicy(policy({ twoFactor: 'forbidden', passkey: 'allowed' }), { mail: true }).platformSignIn).toBe('allowed')
  })

  it('turns emailed codes off without mail, and passwords back on so nobody is locked out', () => {
    expect(effectiveSignInPolicy(policy({ password: 'forbidden', twoFactor: 'allowed' }), { mail: false })).toEqual(policy({ emailCode: 'forbidden' }))
    expect(effectiveSignInPolicy(defaultSignInPolicy, { mail: false })).toEqual(policy({ emailCode: 'forbidden' }))
  })

  it('turns staff sign-in off without mail when the person is to be told, since nobody would be', () => {
    expect(effectiveSignInPolicy(policy({ staffAccess: 'notify' }), { mail: false })).toEqual(policy({ emailCode: 'forbidden', staffAccess: 'forbidden' }))
    expect(effectiveSignInPolicy(policy({ staffAccess: 'notify' }), { mail: true }).staffAccess).toBe('notify')
  })
})

describe('missingRequiredMethods', () => {
  it('names what the policy requires and the account lacks, two-factor first', () => {
    const strict = policy({ passkey: 'required', twoFactor: 'required' })
    expect(missingRequiredMethods(strict, { passkeys: 0, twoFactor: false })).toEqual(['twoFactor', 'passkey'])
    expect(missingRequiredMethods(strict, { passkeys: 2, twoFactor: false })).toEqual(['twoFactor'])
    expect(missingRequiredMethods(strict, { passkeys: 1, twoFactor: true })).toEqual([])
    expect(missingRequiredMethods(defaultSignInPolicy, { passkeys: 0, twoFactor: false })).toEqual([])
  })
})

describe('signInPolicyProblem', () => {
  it('accepts the default, and requiring passkeys or two-factor authentication', () => {
    expect(signInPolicyProblem(defaultSignInPolicy, { mail: false, admin })).toBeUndefined()
    expect(signInPolicyProblem(policy({ passkey: 'required', twoFactor: 'required' }), { mail: true, admin })).toBeUndefined()
  })

  it('accepts passwords off when emailed codes stay on and mail works', () => {
    expect(signInPolicyProblem(policy({ password: 'forbidden', passkey: 'required' }), { mail: true, admin })).toBeUndefined()
  })

  it('refuses turning off every way in for someone without a passkey', () => {
    expect(signInPolicyProblem(policy({ password: 'forbidden', emailCode: 'forbidden', passkey: 'required' }), { mail: true, admin: { ...admin, passkeys: 1 } })).toMatch(/Keep password or emailed-code sign-in on/)
  })

  it('refuses passwords off without mail, since emailed codes cannot be sent', () => {
    expect(signInPolicyProblem(policy({ password: 'forbidden' }), { mail: false, admin })).toMatch(/Emailed codes need mail settings/)
  })

  it('refuses emailing people about staff sign-ins without mail', () => {
    expect(signInPolicyProblem(policy({ staffAccess: 'notify' }), { mail: false, admin })).toMatch(/needs mail settings/)
    expect(signInPolicyProblem(policy({ staffAccess: 'notify' }), { mail: true, admin })).toBeUndefined()
    expect(signInPolicyProblem(policy({ staffAccess: 'forbidden' }), { mail: false, admin })).toBeUndefined()
  })

  it('refuses requiring two-factor authentication with passwords off, since turning it on asks for the password', () => {
    expect(signInPolicyProblem(policy({ password: 'forbidden', twoFactor: 'required' }), { mail: true, admin })).toMatch(/cannot be required while password sign-in is off/)
  })

  it('refuses a policy the saving admin could not sign in with', () => {
    const passwordless = { ...admin, password: false }
    const noCodes = policy({ emailCode: 'forbidden' })
    expect(signInPolicyProblem(noCodes, { mail: true, admin: passwordless })).toMatch(/without a way to sign in/)
    expect(signInPolicyProblem({ ...noCodes, passkey: 'forbidden' }, { mail: true, admin: { ...passwordless, passkeys: 1 } })).toMatch(/without a way to sign in/)
    expect(signInPolicyProblem(noCodes, { mail: true, admin: { ...passwordless, passkeys: 1 } })).toBeUndefined()
    expect(signInPolicyProblem(noCodes, { mail: true, admin: { ...passwordless, socialSignIn: true } })).toBeUndefined()
    expect(signInPolicyProblem(defaultSignInPolicy, { mail: true, admin: passwordless })).toBeUndefined()
  })
})
