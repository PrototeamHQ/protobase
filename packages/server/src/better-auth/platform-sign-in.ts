import type { GenericOAuthConfig } from 'better-auth/plugins'
import { decodeJwt } from 'jose'

/**
 * A sign-in provider the platform adds to the app, for people who already have an account: any OpenID Connect
 * provider, with this app registered as a confidential client whose redirect URI is
 * `{baseURL}/api/auth/callback/{provider}`. It never creates accounts.
 */
export type PlatformSignIn = {
  /** The provider's issuer URL; its settings are read from `{issuer}/.well-known/openid-configuration`. */
  issuer: string
  clientId: string
  clientSecret: string
  /**
   * The id of the provider: the button, the callback path, and the namespace of the linked accounts. Default `oidc`.
   * Use `github` only when the provider's `sub` is the GitHub user id, so its accounts are those of Better Auth's own
   * GitHub provider.
   */
  provider?: string
  /** Shown on the sign-in page as "Continue with {name}". Default `GitHub` for the `github` provider, `SSO` otherwise. */
  name?: string
  /** Scopes asked for besides `openid email profile`. */
  scopes?: string[]
}

export const signInIssuerVariable = 'PROTOBASE_SIGN_IN_ISSUER'
export const signInClientIdVariable = 'PROTOBASE_SIGN_IN_CLIENT_ID'
export const signInClientSecretVariable = 'PROTOBASE_SIGN_IN_CLIENT_SECRET'
export const signInProviderVariable = 'PROTOBASE_SIGN_IN_PROVIDER'
export const signInNameVariable = 'PROTOBASE_SIGN_IN_NAME'

/**
 * The provider the platform passes in `PROTOBASE_SIGN_IN_ISSUER`, `PROTOBASE_SIGN_IN_CLIENT_ID` and
 * `PROTOBASE_SIGN_IN_CLIENT_SECRET` (with `PROTOBASE_SIGN_IN_PROVIDER` and `PROTOBASE_SIGN_IN_NAME` optional);
 * `undefined` when none of the three is set. Some but not all of them stops the server at startup.
 */
export const readPlatformSignIn = (env: Record<string, string | undefined>): PlatformSignIn | undefined => {
  const required = [signInIssuerVariable, signInClientIdVariable, signInClientSecretVariable]
  const [issuer, clientId, clientSecret] = required.map((name) => env[name]?.trim() || undefined)
  if (!issuer && !clientId && !clientSecret) return undefined
  if (!issuer || !clientId || !clientSecret) throw new Error(`${required.join(', ')} go together: set all three for the platform sign-in provider, or none`)
  const provider = env[signInProviderVariable]?.trim()
  const name = env[signInNameVariable]?.trim()
  return { issuer, clientId, clientSecret, ...(provider && { provider }), ...(name && { name }) }
}

const providerId = /^[a-z][a-z0-9-]*$/

/** The provider with its defaults filled in; an issuer that is not a URL or a malformed id is an error. */
export const resolvePlatformSignIn = (signIn: PlatformSignIn) => {
  if (!URL.canParse(signIn.issuer)) throw new Error(`The platform sign-in provider's issuer must be a URL, not "${signIn.issuer}"`)
  const provider = signIn.provider ?? 'oidc'
  if (!providerId.test(provider)) throw new Error(`Invalid sign-in provider id "${provider}": use lowercase letters, digits or "-"`)
  return { ...signIn, provider, name: signIn.name ?? (provider === 'github' ? 'GitHub' : 'SSO'), scopes: signIn.scopes ?? [] }
}

export type ResolvedPlatformSignIn = ReturnType<typeof resolvePlatformSignIn>

/** The platform provider, unless the app configures a provider of its own with the same id, which then wins. */
export const platformSignInFor = (signIn: ResolvedPlatformSignIn | undefined, socialProviders: string[]) =>
  signIn && !socialProviders.includes(signIn.provider) ? signIn : undefined

/**
 * The person as an ID token Better Auth already verified (the provider's keys, this client and the nonce) says, once
 * its issuer is the configured one; `null` without an ID token, so nothing comes from an unverified source.
 */
export const idTokenUser = (idToken: string | undefined, issuer: string) => {
  if (!idToken) return null
  const claims = decodeJwt(idToken)
  if (claims.iss !== issuer || typeof claims.sub !== 'string' || !claims.sub || typeof claims.email !== 'string') return null
  return {
    id: claims.sub,
    sub: claims.sub,
    email: claims.email,
    emailVerified: claims.email_verified === true,
    name: typeof claims.name === 'string' && claims.name ? claims.name : claims.email.split('@')[0]!,
    ...(typeof claims.picture === 'string' && { image: claims.picture }),
  }
}

/**
 * The provider for Better Auth's generic OAuth plugin: discovery, PKCE, the client secret in a Basic header, an ID
 * token that must verify against the provider's keys, and no sign-up. A provider whose settings cannot be read at
 * startup is left out until the next start.
 */
export const platformSignInProvider = (signIn: ResolvedPlatformSignIn): GenericOAuthConfig => ({
  providerId: signIn.provider,
  name: signIn.name,
  clientId: signIn.clientId,
  clientSecret: signIn.clientSecret,
  discoveryUrl: `${signIn.issuer.replace(/\/$/, '')}/.well-known/openid-configuration`,
  scopes: ['openid', 'email', 'profile', ...signIn.scopes],
  pkce: true,
  requireIdTokenVerification: true,
  authentication: 'basic',
  disableSignUp: true,
  getUserInfo: async (tokens) => idTokenUser(tokens.idToken, signIn.issuer),
})
