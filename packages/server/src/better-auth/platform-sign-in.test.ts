import { UnsecuredJWT } from 'jose'
import { describe, expect, it } from 'vitest'
import { idTokenUser, platformSignInFor, platformSignInProvider, readPlatformSignIn, resolvePlatformSignIn } from './platform-sign-in'

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

  it('refuses some but not all of the three', () => {
    expect(() => readPlatformSignIn({ PROTOBASE_SIGN_IN_ISSUER: env.PROTOBASE_SIGN_IN_ISSUER, PROTOBASE_SIGN_IN_CLIENT_ID: 'app' })).toThrow(/go together/)
  })
})

describe('resolvePlatformSignIn', () => {
  it('defaults the id to oidc and names the provider after it', () => {
    expect(resolvePlatformSignIn(settings)).toMatchObject({ provider: 'oidc', name: 'SSO', scopes: [] })
    expect(resolvePlatformSignIn({ ...settings, provider: 'github' })).toMatchObject({ provider: 'github', name: 'GitHub' })
    expect(resolvePlatformSignIn({ ...settings, provider: 'github', name: 'Protobase' }).name).toBe('Protobase')
  })

  it('refuses an issuer that is not a URL and an id that is not a plain name', () => {
    expect(() => resolvePlatformSignIn({ ...settings, issuer: 'auth.example.com' })).toThrow(/must be a URL/)
    expect(() => resolvePlatformSignIn({ ...settings, provider: 'Git Hub' })).toThrow(/Invalid sign-in provider id/)
  })
})

describe('platformSignInFor', () => {
  it("gives way to the app's own provider with the same id", () => {
    const github = resolvePlatformSignIn({ ...settings, provider: 'github' })
    expect(platformSignInFor(github, ['github'])).toBeUndefined()
    expect(platformSignInFor(github, ['google'])).toBe(github)
    expect(platformSignInFor(undefined, [])).toBeUndefined()
  })
})

describe('platformSignInProvider', () => {
  it('uses discovery, PKCE, a Basic client secret and verified ID tokens, and signs nobody up', () => {
    expect(platformSignInProvider(resolvePlatformSignIn({ ...settings, issuer: 'https://auth.example.com/' }))).toMatchObject({
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
