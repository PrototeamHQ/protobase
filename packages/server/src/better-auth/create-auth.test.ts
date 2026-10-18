import { describe, expect, it } from 'vitest'
import { betterAuthOptions, createAuth, type CreateAuthOptions } from './create-auth'
import { roleDefinitions } from './organizations/role-definitions'
import { resolvePlatformSignIn } from './platform-sign-in'
import { resolveSamlProviders, samlDisabledPaths } from './saml-sign-in'
import { coreNames } from './snake-case-names'

const base: CreateAuthOptions = { database: undefined, baseURL: 'https://admin.example.com', secret: 'test-secret-test-secret-test-secret-1234' }
const resolved = { roles: ['admin', 'user'], definitions: roleDefinitions(), defaultRole: 'user' }
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

  it('adds open sign-up only with a sign-up role and a mailer, and limits it as sign-in', () => {
    const mailer = { send: async () => {} }
    const plugins = (extra: object) => betterAuthOptions({ ...base, signInPerMinute: 7 }, { ...resolved, ...extra }).plugins.map((plugin) => plugin.id)
    expect(plugins({ mailer })).not.toContain('protobase-sign-up')
    expect(plugins({ signUpRole: 'user' })).not.toContain('protobase-sign-up')
    expect(plugins({ mailer, signUpRole: 'user' })).toContain('protobase-sign-up')
    const { customRules } = betterAuthOptions({ ...base, signInPerMinute: 7 }, resolved).rateLimit
    expect([customRules['/sign-up/send-code'], customRules['/sign-up/create']]).toEqual([{ window: 60, max: 7 }, { window: 60, max: 7 }])
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

  it("gives a new user the id generateUserId makes, and Better Auth's own without it", async () => {
    const user = { email: 'rep@example.com', name: 'Rep', role: 'user' }
    const before = (options: CreateAuthOptions) => betterAuthOptions(options, resolved).databaseHooks.user.create.before as (user: object, context: null) => Promise<{ data: object }>
    expect((await before({ ...base, generateUserId: async () => '42' })(user, null)).data).toEqual({ ...user, id: '42' })
    expect((await before(base)(user, null)).data).toEqual(user)
  })

  it('answers each of several origins for its own host, with baseURL as issuer and passkeys on its host', () => {
    const options = betterAuthOptions(base, { ...resolved, origins: ['https://admin.shop.com'] })
    expect(options.baseURL).toEqual({ allowedHosts: ['admin.example.com', 'admin.shop.com'], fallback: 'https://admin.example.com', protocol: 'https' })
    expect(options.trustedOrigins).toEqual(expect.arrayContaining(['https://admin.example.com', 'https://admin.shop.com']))
    const jwt = options.plugins.find((plugin) => plugin.id === 'jwt') as { options?: { jwt?: { issuer?: string; audience?: string } } }
    expect(jwt.options?.jwt).toMatchObject({ issuer: 'https://admin.example.com', audience: 'https://admin.example.com' })
    const passkey = options.plugins.find((plugin) => plugin.id === 'passkey') as { options?: { rpID?: string } }
    expect(passkey.options?.rpID).toBe('admin.example.com')
  })

  it('makes new passkeys for the passkey domain and keeps the RP ID of each', () => {
    const options = betterAuthOptions(base, { ...resolved, origins: ['https://admin.shop.com'], passkeyDomain: 'admin.shop.com' })
    const passkey = options.plugins.find((plugin) => plugin.id === 'passkey')!
    expect((passkey as { options?: { rpID?: string } }).options?.rpID).toBe('admin.shop.com')
    expect(passkey.schema.passkey.fields.rpID).toMatchObject({ type: 'string', required: false, fieldName: 'rp_id' })
    expect(passkey.schema.passkey.fields.rpID.defaultValue()).toBe('admin.shop.com')
  })

  it('keeps baseURL a string on one origin', () => {
    expect(betterAuthOptions(base, resolved).baseURL).toBe('https://admin.example.com')
  })

  it('adds the platform sign-in provider, unless the app has its own provider with the same id', () => {
    const platformSignIn = resolvePlatformSignIn({ issuer: 'https://auth.example.com', clientId: 'app', clientSecret: 'secret', provider: 'github' })
    const plugins = (options: CreateAuthOptions) => betterAuthOptions(options, { ...resolved, platformSignIn }).plugins.map((plugin) => plugin.id)
    expect(plugins(base)).toContain('generic-oauth')
    expect(plugins({ ...base, socialProviders: github })).not.toContain('generic-oauth')
    expect(betterAuthOptions(base, resolved).plugins.map((plugin) => plugin.id)).not.toContain('generic-oauth')
  })

  it('adds the SSO plugin without its provider table, and turns off its management paths, only with SAML providers', () => {
    const saml = resolveSamlProviders([{ id: 'okta', domains: ['example.com'], idp: { metadata: '<EntityDescriptor entityID="https://idp.example.com"/>' } }], [])
    const without = betterAuthOptions(base, resolved)
    expect(without.plugins.map((plugin) => plugin.id)).not.toContain('sso')
    expect(without.disabledPaths).not.toContain('/sso/register')
    const options = betterAuthOptions(base, { ...resolved, saml })
    const plugin = options.plugins.find((plugin) => plugin.id === 'sso')
    expect(plugin).toBeDefined()
    expect(plugin).not.toHaveProperty('schema')
    expect(options.plugins.map((plugin) => plugin.id)).toContain('protobase-saml-guard')
    expect(options.disabledPaths).toEqual([...without.disabledPaths, ...samlDisabledPaths])
  })
})

describe('createAuth', () => {
  it('refuses a SAML provider with the id of a social provider', () => {
    const sso = { saml: [{ id: 'github', domains: ['example.com'], idp: { metadata: '<EntityDescriptor/>' } }] }
    expect(() => createAuth({ ...base, socialProviders: github, sso })).toThrow(/"github" is already the id of another sign-in provider/)
  })
})
