import { UnsecuredJWT } from 'jose'
import { describe, expect, it } from 'vitest'
import { idTokenUser, platformSignInFor, platformSignInProvider, resolvePlatformSignIn, resolvePlatformSignIns, startsProviderPages } from './platform-sign-in'

const settings = { issuer: 'https://auth.example.com', clientId: 'app.example.com', clientSecret: 'secret' }
const idToken = (claims: Record<string, unknown>) => new UnsecuredJWT(claims).encode()

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

describe('fixed authorization parameters', () => {
  it('go on every authorization request, and may not be one the sign-in sets itself', () => {
    const fixed = resolvePlatformSignIn({ ...settings, authorizationParams: { connection: 'github' } }, 'https://app.example.com')
    expect(platformSignInProvider(fixed).authorizationUrlParams).toEqual({ connection: 'github' })
    expect(platformSignInProvider(resolvePlatformSignIn(settings, 'https://app.example.com')).authorizationUrlParams).toBeUndefined()
    for (const name of ['state', 'redirect_uri', 'client_id', 'nonce']) {
      expect(() => resolvePlatformSignIn({ ...settings, authorizationParams: { [name]: 'x' } }, 'https://app.example.com')).toThrow(`cannot fix the authorization parameter ${name}`)
    }
  })

  it('leave the name to show apart from the id, so two providers may show the same one', () => {
    const both = resolvePlatformSignIns([{ ...settings, provider: 'github', name: 'GitHub' }, { ...settings, provider: 'console', name: 'GitHub', hidden: true }], 'https://app.example.com')
    expect(both.map(({ provider, name, hidden }) => ({ provider, name, hidden }))).toEqual([{ provider: 'github', name: 'GitHub', hidden: false }, { provider: 'console', name: 'GitHub', hidden: true }])
  })
})

describe('a provider of devices', () => {
  it('signs in by token alone', () => {
    expect(resolvePlatformSignIn({ issuer: settings.issuer, tokenSignIn: true, devices: true }, 'https://app.example.com')).toMatchObject({ devices: true, pages: false })
    expect(resolvePlatformSignIn(settings, 'https://app.example.com').devices).toBe(false)
    expect(() => resolvePlatformSignIn({ ...settings, tokenSignIn: true, devices: true }, 'https://app.example.com')).toThrow(/signs in devices by token alone/)
  })
})

describe('a provider without a client secret', () => {
  it('signs in by token alone, with tokens for the origin of the app unless a client id names another', () => {
    expect(resolvePlatformSignIn({ issuer: settings.issuer, tokenSignIn: true }, 'https://shop.example.app/admin')).toMatchObject({ clientId: 'https://shop.example.app', pages: false, tokenSignIn: true })
    expect(resolvePlatformSignIn({ issuer: settings.issuer, clientId: 'shop', tokenSignIn: true }, 'https://shop.example.app')).toMatchObject({ clientId: 'shop', pages: false })
    expect(platformSignInProvider(resolvePlatformSignIn({ issuer: settings.issuer, tokenSignIn: true }, 'https://shop.example.app')).authentication).toBeUndefined()
  })

  it("knows the requests that would send someone through the provider's pages, and not a posted token", () => {
    const tokensOnly = ['oidc', 'central']
    expect(startsProviderPages('/sign-in/social', { provider: 'oidc', callbackURL: '/' }, tokensOnly)).toBe(true)
    expect(startsProviderPages('/sign-in/social', { provider: 'central', callbackURL: '/' }, tokensOnly)).toBe(true)
    expect(startsProviderPages('/link-social', { provider: 'oidc' }, tokensOnly)).toBe(true)
    expect(startsProviderPages('/sign-in/oauth2', { providerId: 'oidc' }, tokensOnly)).toBe(true)
    expect(startsProviderPages('/oauth2/link', { providerId: 'oidc' }, tokensOnly)).toBe(true)
    expect(startsProviderPages('/sign-in/social', { provider: 'oidc', idToken: { token: 'x' } }, tokensOnly)).toBe(false)
    expect(startsProviderPages('/sign-in/social', { provider: 'github' }, tokensOnly)).toBe(false)
    expect(startsProviderPages('/sign-in/email', { provider: 'oidc' }, tokensOnly)).toBe(false)
  })
})

describe('resolvePlatformSignIns', () => {
  it('resolves each provider, and refuses two with one id', () => {
    const central = { issuer: 'https://id.example.net', provider: 'central', tokenSignIn: true }
    expect(resolvePlatformSignIns([settings, central], 'https://app.example.com')).toMatchObject([{ provider: 'oidc', pages: true }, { provider: 'central', pages: false, clientId: 'https://app.example.com' }])
    expect(resolvePlatformSignIns([], 'https://app.example.com')).toEqual([])
    expect(() => resolvePlatformSignIns([settings, { ...central, provider: undefined }], 'https://app.example.com')).toThrow('Two platform sign-in providers have the id "oidc"')
  })
})

describe('platformSignInFor', () => {
  it("gives way to the app's own provider with the same id, and keeps the others", () => {
    const [github, central] = resolvePlatformSignIns([{ ...settings, provider: 'github' }, { issuer: 'https://id.example.net', provider: 'central', tokenSignIn: true }], 'https://app.example.com')
    expect(platformSignInFor([github!, central!], ['github'])).toEqual([central])
    expect(platformSignInFor([github!], ['google'])).toEqual([github])
    expect(platformSignInFor([], [])).toEqual([])
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
