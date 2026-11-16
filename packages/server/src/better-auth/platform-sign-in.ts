import type { BetterAuthPlugin } from 'better-auth'
import { APIError, createAuthMiddleware } from 'better-auth/api'
import type { GenericOAuthConfig } from 'better-auth/plugins'
import { decodeJwt } from 'jose'
import type { SignInRefusal } from './sign-in-enforcement'

/**
 * A sign-in provider the platform adds to the app, for people who already have an account: any OpenID Connect
 * provider, with this app registered as a confidential client whose redirect URI is
 * `{baseURL}/api/auth/callback/{provider}`. It never creates accounts. Without `clientSecret` it signs in by token
 * sign-in alone: the app is no client of the provider's, nobody is sent through its pages, and the tokens are for
 * `clientId`, by default the origin of the app's `baseURL`.
 */
export type PlatformSignIn = {
  /** The provider's issuer URL; its settings are read from `{issuer}/.well-known/openid-configuration`. */
  issuer: string
  /** This app's client id at the provider, which its ID tokens name as their audience; default the origin of `baseURL` without `clientSecret`. */
  clientId?: string
  /** The client secret for sign-in through the provider's pages; without it, only `tokenSignIn`, which must then be on. */
  clientSecret?: string
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
  /**
   * Token sign-in: a client that holds a fresh ID token the provider issued for this app posts it instead of sending
   * the browser through the provider, and gets the app's own session (see `idTokenSignInPlugin`). Default off.
   */
  tokenSignIn?: boolean
}

export const signInIssuerVariable = 'PROTOBASE_SIGN_IN_ISSUER'
export const signInClientIdVariable = 'PROTOBASE_SIGN_IN_CLIENT_ID'
export const signInClientSecretVariable = 'PROTOBASE_SIGN_IN_CLIENT_SECRET'
export const signInProviderVariable = 'PROTOBASE_SIGN_IN_PROVIDER'
export const signInNameVariable = 'PROTOBASE_SIGN_IN_NAME'
export const signInTokensVariable = 'PROTOBASE_SIGN_IN_TOKENS'

// A boolean variable is true or false; unset or empty, it is not given.
const readBoolean = (env: Record<string, string | undefined>, name: string) => {
  const value = env[name]?.trim()
  if (!value) return
  if (value !== 'true' && value !== 'false') throw new Error(`${name} must be true or false, not "${value}"`)
  return value === 'true'
}

/**
 * The provider the platform passes in `PROTOBASE_SIGN_IN_ISSUER`, `PROTOBASE_SIGN_IN_CLIENT_ID` and
 * `PROTOBASE_SIGN_IN_CLIENT_SECRET` (with `PROTOBASE_SIGN_IN_PROVIDER`, `PROTOBASE_SIGN_IN_NAME` and
 * `PROTOBASE_SIGN_IN_TOKENS` optional); `undefined` when none of the three is set. With `PROTOBASE_SIGN_IN_TOKENS=true`
 * the issuer alone will do, or with the client id, for token sign-in alone. Anything else short of all three, or
 * `PROTOBASE_SIGN_IN_TOKENS=true` without an issuer, or that variable other than `true` or `false`, stops the server at startup.
 */
export const readPlatformSignIn = (env: Record<string, string | undefined>): PlatformSignIn | undefined => {
  const required = [signInIssuerVariable, signInClientIdVariable, signInClientSecretVariable]
  const [issuer, clientId, clientSecret] = required.map((name) => env[name]?.trim() || undefined)
  const tokenSignIn = readBoolean(env, signInTokensVariable)
  if (!issuer && !clientId && !clientSecret) {
    if (tokenSignIn) throw new Error(`${signInTokensVariable} needs the platform sign-in provider: set ${required.join(', ')} too, or leave it out`)
    return undefined
  }
  if (!issuer || (clientSecret && !clientId) || (!clientSecret && tokenSignIn !== true)) {
    throw new Error(`${required.join(', ')} go together: set all three for the platform sign-in provider, or none; or ${signInIssuerVariable} with ${signInTokensVariable}=true for token sign-in alone`)
  }
  const provider = env[signInProviderVariable]?.trim()
  const name = env[signInNameVariable]?.trim()
  return { issuer, ...(clientId && { clientId }), ...(clientSecret && { clientSecret }), ...(provider && { provider }), ...(name && { name }), ...(tokenSignIn !== undefined && { tokenSignIn }) }
}

/** What a sign-in provider id may be: lowercase letters, digits or "-", starting with a letter. */
export const providerIdPattern = /^[a-z][a-z0-9-]*$/

/**
 * The provider with its defaults filled in, for an app at `baseURL`: `pages` says whether people sign in through the
 * provider's pages, which takes a client secret. An issuer that is not a URL, a malformed id, or neither a secret nor
 * token sign-in is an error.
 */
export const resolvePlatformSignIn = (signIn: PlatformSignIn, baseURL: string) => {
  if (!URL.canParse(signIn.issuer)) throw new Error(`The platform sign-in provider's issuer must be a URL, not "${signIn.issuer}"`)
  const provider = signIn.provider ?? 'oidc'
  if (!providerIdPattern.test(provider)) throw new Error(`Invalid sign-in provider id "${provider}": use lowercase letters, digits or "-"`)
  const pages = Boolean(signIn.clientSecret)
  if (!pages && signIn.tokenSignIn !== true) throw new Error("The platform sign-in provider needs a clientSecret for sign-in through its pages, or tokenSignIn: true for token sign-in alone")
  if (pages && !signIn.clientId) throw new Error("The platform sign-in provider's clientSecret needs its clientId")
  const clientId = signIn.clientId ?? new URL(baseURL).origin
  return { ...signIn, clientId, pages, provider, name: signIn.name ?? (provider === 'github' ? 'GitHub' : 'SSO'), scopes: signIn.scopes ?? [], tokenSignIn: signIn.tokenSignIn === true }
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
 * startup is left out until the next start. Without a client secret it only verifies the ID tokens token sign-in
 * posts, and `providerPagesOffPlugin` refuses sending anyone through its pages.
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
  ...(signIn.pages && { authentication: 'basic' as const }),
  disableSignUp: true,
  getUserInfo: async (tokens) => idTokenUser(tokens.idToken, signIn.issuer),
})

export const providerPagesOff: SignInRefusal = { code: 'PROVIDER_PAGES_OFF', message: 'This provider signs in with a token only, not through its pages.' }

// Where a browser starts out to a provider's pages, to sign in or to connect it, and the body field naming the provider.
const pagePaths: Record<string, 'provider' | 'providerId'> = { '/sign-in/social': 'provider', '/link-social': 'provider', '/sign-in/oauth2': 'providerId', '/oauth2/link': 'providerId' }

/** Whether a request starts sending a browser through `provider`'s pages, rather than posting an ID token. */
export const startsProviderPages = (path: string | undefined, body: unknown, provider: string) => {
  const field = path === undefined ? undefined : pagePaths[path]
  if (!field || typeof body !== 'object' || body === null) return false
  const named = body as Record<string, unknown>
  return named[field] === provider && named.idToken === undefined
}

/**
 * Refuses sending anyone through the pages of the platform's provider when it has no client secret (`403
 * PROVIDER_PAGES_OFF`): to sign in, or to connect it from the account page. Token sign-in alone stays.
 */
export const providerPagesOffPlugin = (provider: string) =>
  ({
    id: 'protobase-provider-pages-off',
    hooks: {
      before: [
        {
          matcher: (context) => startsProviderPages(context.path, context.body, provider),
          handler: createAuthMiddleware(async () => {
            throw new APIError('FORBIDDEN', providerPagesOff)
          }),
        },
      ],
    },
  }) satisfies BetterAuthPlugin
