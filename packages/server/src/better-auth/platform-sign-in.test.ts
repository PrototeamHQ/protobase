import { UnsecuredJWT } from 'jose'
import { describe, expect, it } from 'vitest'
import { idTokenUser, platformSignInFor, platformSignInProvider, readPlatformSignIn, resolvePlatformSignIn, startsProviderPages } from './platform-sign-in'

const env = { PROTOBASE_SIGN_IN_ISSUER: 'https://auth.example.com', PROTOBASE_SIGN_IN_CLIENT_ID: 'app.example.com', PROTOBASE_SIGN_IN_CLIENT_SECRET: 'secret' }
const settings = { issuer: 'https://auth.example.com', clientId: 'app.example.com', clientSecret: 'secret' }
const idToken = (claims: Record<string, unknown>) => new UnsecuredJWT(claims).encode()

describe('readPlatformSignIn', () => {
  it('is undefined without any of the three, and reads all of them with the optional id and name', () => {
    expect(readPlatformSignIn({})).toBeUndefined()
    expect(readPlatformSignIn({ PROTOBASE_SIGN_IN_ISSUER: ' ' })).toBeUndefined()
    expect(readPlatformSignIn(env)).toEqual(settings)
    expect(readPlatformSignIn({ ...env, PROTOBASE_SIGN_IN_PROVIDER: 'github', PROTOBASE_SIGN_IN_NAME: 'GitHub' })).toEqual({ ...settings, provider: 'github', name: 'GitHub' })
  })

  it('reads token sign-in from PROTOBASE_SIGN_IN_TOKENS, true or false only', () => {
    expect(readPlatformSignIn({ ...env, PROTOBASE_SIGN_IN_TOKENS: 'true' })).toEqual({ ...settings, tokenSignIn: true })
    expect(readPlatformSignIn({ ...env, PROTOBASE_SIGN_IN_TOKENS: 'false' })).toEqual({ ...settings, tokenSignIn: false })
    expect(readPlatformSignIn({ ...env, PROTOBASE_SIGN_IN_TOKENS: '' })).toEqual(settings)
    for (const value of ['on', '1', 'yes', 'TRUE']) expect(() => readPlatformSignIn({ ...env, PROTOBASE_SIGN_IN_TOKENS: value })).toThrow(/PROTOBASE_SIGN_IN_TOKENS must be true or false/)
  })

  it('refuses token sign-in without the provider', () => {
    expect(() => readPlatformSignIn({ PROTOBASE_SIGN_IN_TOKENS: 'true' })).toThrow(/needs the platform sign-in provider/)
    expect(readPlatformSignIn({ PROTOBASE_SIGN_IN_TOKENS: 'false' })).toBeUndefined()
  })

  it('refuses some but not all of the three', () => {
    expect(() => readPlatformSignIn({ PROTOBASE_SIGN_IN_ISSUER: env.PROTOBASE_SIGN_IN_ISSUER, PROTOBASE_SIGN_IN_CLIENT_ID: 'app' })).toThrow(/go together/)
    expect(() => readPlatformSignIn({ PROTOBASE_SIGN_IN_ISSUER: env.PROTOBASE_SIGN_IN_ISSUER, PROTOBASE_SIGN_IN_CLIENT_SECRET: 'secret', PROTOBASE_SIGN_IN_TOKENS: 'true' })).toThrow(/go together/)
    expect(() => readPlatformSignIn({ PROTOBASE_SIGN_IN_CLIENT_ID: 'app', PROTOBASE_SIGN_IN_TOKENS: 'true' })).toThrow(/go together/)
  })

  it('reads the issuer alone, or with the client id, for token sign-in alone', () => {
    expect(readPlatformSignIn({ PROTOBASE_SIGN_IN_ISSUER: env.PROTOBASE_SIGN_IN_ISSUER, PROTOBASE_SIGN_IN_TOKENS: 'true' })).toEqual({ issuer: settings.issuer, tokenSignIn: true })
    expect(readPlatformSignIn({ PROTOBASE_SIGN_IN_ISSUER: env.PROTOBASE_SIGN_IN_ISSUER, PROTOBASE_SIGN_IN_CLIENT_ID: 'app', PROTOBASE_SIGN_IN_TOKENS: 'true' })).toEqual({ issuer: settings.issuer, clientId: 'app', tokenSignIn: true })
    expect(() => readPlatformSignIn({ PROTOBASE_SIGN_IN_ISSUER: env.PROTOBASE_SIGN_IN_ISSUER })).toThrow(/token sign-in alone/)
  })
})

describe('resolvePlatformSignIn', () => {
  it('defaults the id to oidc and names the provider after it', () => {
    expect(resolvePlatformSignIn(settings, 'https://app.example.com')).toMatchObject({ provider: 'oidc', name: 'SSO', scopes: [], tokenSignIn: false, pages: true })
    expect(resolvePlatformSignIn({ ...settings, provider: 'github' }, 'https://app.example.com')).toMatchObject({ provider: 'github', name: 'GitHub' })
    expect(resolvePlatformSignIn({ ...settings, provider: 'github', name: 'Protobase' }, 'https://app.example.com').name).toBe('Protobase')
  })

  it('refuses an issuer that is not a URL and an id that is not a plain name', () => {
    expect(() => resolvePlatformSignIn({ issuer: settings.issuer }, 'https://app.example.com')).toThrow(/clientSecret .* or tokenSignIn: true/)
    expect(() => resolvePlatformSignIn({ issuer: settings.issuer, clientSecret: 'secret' }, 'https://app.example.com')).toThrow(/needs its clientId/)
    expect(() => resolvePlatformSignIn({ ...settings, issuer: 'auth.example.com' }, 'https://app.example.com')).toThrow(/must be a URL/)
    expect(() => resolvePlatformSignIn({ ...settings, provider: 'Git Hub' }, 'https://app.example.com')).toThrow(/Invalid sign-in provider id/)
  })
})

describe('a provider without a client secret', () => {
  it('signs in by token alone, with tokens for the origin of the app unless a client id names another', () => {
    expect(resolvePlatformSignIn({ issuer: settings.issuer, tokenSignIn: true }, 'https://shop.example.app/admin')).toMatchObject({ clientId: 'https://shop.example.app', pages: false, tokenSignIn: true })
    expect(resolvePlatformSignIn({ issuer: settings.issuer, clientId: 'shop', tokenSignIn: true }, 'https://shop.example.app')).toMatchObject({ clientId: 'shop', pages: false })
    expect(platformSignInProvider(resolvePlatformSignIn({ issuer: settings.issuer, tokenSignIn: true }, 'https://shop.example.app')).authentication).toBeUndefined()
  })

  it("knows the requests that would send someone through the provider's pages, and not a posted token", () => {
    expect(startsProviderPages('/sign-in/social', { provider: 'oidc', callbackURL: '/' }, 'oidc')).toBe(true)
    expect(startsProviderPages('/link-social', { provider: 'oidc' }, 'oidc')).toBe(true)
    expect(startsProviderPages('/sign-in/oauth2', { providerId: 'oidc' }, 'oidc')).toBe(true)
    expect(startsProviderPages('/oauth2/link', { providerId: 'oidc' }, 'oidc')).toBe(true)
    expect(startsProviderPages('/sign-in/social', { provider: 'oidc', idToken: { token: 'x' } }, 'oidc')).toBe(false)
    expect(startsProviderPages('/sign-in/social', { provider: 'github' }, 'oidc')).toBe(false)
    expect(startsProviderPages('/sign-in/email', { provider: 'oidc' }, 'oidc')).toBe(false)
  })
})

describe('platformSignInFor', () => {
  it("gives way to the app's own provider with the same id", () => {
    const github = resolvePlatformSignIn({ ...settings, provider: 'github' }, 'https://app.example.com')
    expect(platformSignInFor(github, ['github'])).toBeUndefined()
    expect(platformSignInFor(github, ['google'])).toBe(github)
    expect(platformSignInFor(undefined, [])).toBeUndefined()
  })
})

describe('platformSignInProvider', () => {
  it('uses discovery, PKCE, a Basic client secret and verified ID tokens, and signs nobody up', () => {
    expect(platformSignInProvider(resolvePlatformSignIn({ ...settings, issuer: 'https://auth.example.com/' }, 'https://app.example.com'))).toMatchObject({
      providerId: 'oidc',
      discoveryUrl: 'https://auth.example.com/.well-known/openid-configuration',
      scopes: ['openid', 'email', 'profile'],
      pkce: true,
      requireIdTokenVerification: true,
      authentication: 'basic',
      disableSignUp: true,
    })
  })
})

describe('idTokenUser', () => {
  const claims = { iss: settings.issuer, sub: '4242', email: 'octo@example.com', email_verified: true, name: 'Octo Cat', picture: 'https://avatars.example/4242' }

  it('maps the claims of the configured issuer to the person', () => {
    expect(idTokenUser(idToken(claims), settings.issuer)).toEqual({ id: '4242', sub: '4242', email: 'octo@example.com', emailVerified: true, name: 'Octo Cat', image: 'https://avatars.example/4242' })
    expect(idTokenUser(idToken({ ...claims, email_verified: 'true', name: undefined, picture: undefined }), settings.issuer)).toEqual({ id: '4242', sub: '4242', email: 'octo@example.com', emailVerified: false, name: 'octo' })
  })

  it('is null without an ID token, from another issuer, or without a subject or email', () => {
    expect(idTokenUser(undefined, settings.issuer)).toBeNull()
    expect(idTokenUser(idToken({ ...claims, iss: 'https://evil.example.com' }), settings.issuer)).toBeNull()
    expect(idTokenUser(idToken({ ...claims, sub: undefined }), settings.issuer)).toBeNull()
    expect(idTokenUser(idToken({ ...claims, email: undefined }), settings.issuer)).toBeNull()
  })
})
