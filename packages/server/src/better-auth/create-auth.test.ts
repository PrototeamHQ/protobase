import { describe, expect, it } from 'vitest'
import { betterAuthOptions, type CreateAuthOptions } from './create-auth'
import { resolvePlatformSignIn } from './platform-sign-in'
import { coreNames } from './snake-case-names'

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

  it('leaves OAuth tokens unencrypted and adds no after-create hook by default', () => {
    const options = betterAuthOptions(base, resolved)
    expect(options.account).toEqual({ ...coreNames.account, accountLinking: { allowDifferentEmails: true } })
    expect(options.databaseHooks.user.create).not.toHaveProperty('after')
  })

  it('turns on OAuth token encryption', () => {
    const { account, ...rest } = betterAuthOptions({ ...base, encryptOAuthTokens: true }, resolved)
    expect(account).toEqual({ ...coreNames.account, accountLinking: { allowDifferentEmails: true }, encryptOAuthTokens: true })
    const { account: _, ...plain } = betterAuthOptions(base, resolved)
    expect(data(rest)).toEqual(data(plain))
  })

  it('passes the after-create hook through and keeps the role check before it', () => {
    const onUserCreated = async () => {}
    const options = betterAuthOptions({ ...base, onUserCreated }, resolved)
    expect(options.databaseHooks.user.create.after).toBe(onUserCreated)
    expect(options.databaseHooks.user.create.before).toBeTypeOf('function')
  })

  it('adds the platform sign-in provider, unless the app has its own provider with the same id', () => {
    const platformSignIn = resolvePlatformSignIn({ issuer: 'https://auth.example.com', clientId: 'app', clientSecret: 'secret', provider: 'github' })
    const plugins = (options: CreateAuthOptions) => betterAuthOptions(options, { ...resolved, platformSignIn }).plugins.map((plugin) => plugin.id)
    expect(plugins(base)).toContain('generic-oauth')
    expect(plugins({ ...base, socialProviders: github })).not.toContain('generic-oauth')
    expect(betterAuthOptions(base, resolved).plugins.map((plugin) => plugin.id)).not.toContain('generic-oauth')
  })
})
