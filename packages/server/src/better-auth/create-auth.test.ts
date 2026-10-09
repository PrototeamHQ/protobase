import { describe, expect, it } from 'vitest'
import { betterAuthOptions, type CreateAuthOptions } from './create-auth'

const base: CreateAuthOptions = { database: undefined, baseURL: 'https://admin.example.com', secret: 'test-secret-test-secret-test-secret-1234' }
const resolved = { roles: ['admin', 'user'], defaultRole: 'user' }
// Better Auth's plugins and the hooks are new functions on every call, so options compare by their data.
const data = (options: object) => JSON.parse(JSON.stringify(options))
const github = { github: { clientId: 'Iv1.client', clientSecret: 'client-secret' } }

describe('betterAuthOptions', () => {
  it('has no social providers and no public sign-up unless providers are given', () => {
    const options = betterAuthOptions(base, resolved)
    expect(options).not.toHaveProperty('socialProviders')
    expect(options.emailAndPassword.disableSignUp).toBe(true)
    expect(data(betterAuthOptions({ ...base, socialProviders: undefined }, resolved))).toEqual(data(options))
  })

  it('passes the social providers through and leaves everything else as it was', () => {
    const { socialProviders, ...rest } = betterAuthOptions({ ...base, socialProviders: github }, resolved)
    expect(socialProviders).toBe(github)
    expect(data(rest)).toEqual(data(betterAuthOptions(base, resolved)))
  })
})
