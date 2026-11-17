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
   * Parameters every authorization request to the provider carries as given, such as one naming which of its own
   * sign-in methods it must use; a client cannot add to them or change them. None of those the flow sets itself
   * (`state`, `client_id`, `redirect_uri`, `response_type`, `scope`, `nonce`, `code_challenge`, `code_challenge_method`).
   */
  authorizationParams?: Record<string, string>
  /**
   * Keeps people's links to the provider off their account page: not listed among the connected accounts, and not
   * connected or disconnected there. The link still signs them in, and goes with the person. Default off.
   */
  hidden?: boolean
  /**
   * Token sign-in: a client that holds a fresh ID token the provider issued for this app posts it instead of sending
   * the browser through the provider, and gets the app's own session (see `idTokenSignInPlugin`). Default off.
   */
  tokenSignIn?: boolean
  /**
   * Each device is an account of its own: the provider gives every device a subject of its own, and a person holds
   * as many accounts of it as they have devices, each linked by the address on its first sign-in like any other. The
   * account page lists them among the devices, named by `name` and the token's `device_name` claim, not among the
   * connected accounts; signing one out there removes it and ends its sessions, and its subject never signs in again.
   * Needs `tokenSignIn` without a `clientSecret`: a device signs in by token alone. Default off.
   */
  devices?: boolean
}

/** What a sign-in provider id may be: lowercase letters, digits or "-", starting with a letter. */
export const providerIdPattern = /^[a-z][a-z0-9-]*$/

// The parameters of an authorization request the flow sets itself, which Better Auth never lets others replace.
const flowParams = ['state', 'client_id', 'redirect_uri', 'response_type', 'scope', 'nonce', 'code_challenge', 'code_challenge_method']

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
  if (signIn.devices === true && (pages || signIn.tokenSignIn !== true)) throw new Error(`The platform sign-in provider "${provider}" signs in devices by token alone: give it tokenSignIn: true and no clientSecret`)
  const authorizationParams = signIn.authorizationParams ?? {}
  const taken = Object.keys(authorizationParams).find((name) => flowParams.includes(name))
  if (taken) throw new Error(`The platform sign-in provider "${provider}" cannot fix the authorization parameter ${taken}: the sign-in sets it itself`)
  const clientId = signIn.clientId ?? new URL(baseURL).origin
  return { ...signIn, clientId, pages, provider, name: signIn.name ?? (provider === 'github' ? 'GitHub' : 'SSO'), scopes: signIn.scopes ?? [], authorizationParams, tokenSignIn: signIn.tokenSignIn === true, hidden: signIn.hidden === true, devices: signIn.devices === true }
}

export type ResolvedPlatformSignIn = ReturnType<typeof resolvePlatformSignIn>

/** Each provider resolved (`resolvePlatformSignIn`); two with the same id are an error, as the id is all a request names. */
export const resolvePlatformSignIns = (signIns: readonly PlatformSignIn[], baseURL: string) => {
  const resolved = signIns.map((signIn) => resolvePlatformSignIn(signIn, baseURL))
  const twice = resolved.find(({ provider }, index) => resolved.findIndex((other) => other.provider === provider) !== index)
  if (twice) throw new Error(`Two platform sign-in providers have the id "${twice.provider}": give each its own provider id`)
  return resolved
}

/** The platform's providers, but for any whose id a provider the app configures itself has, which then wins. */
export const platformSignInFor = (signIns: ResolvedPlatformSignIn[], socialProviders: string[]) => signIns.filter(({ provider }) => !socialProviders.includes(provider))

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
  ...(Object.keys(signIn.authorizationParams).length > 0 && { authorizationUrlParams: signIn.authorizationParams }),
  pkce: true,
  requireIdTokenVerification: true,
  ...(signIn.pages && { authentication: 'basic' as const }),
  disableSignUp: true,
  getUserInfo: async (tokens) => idTokenUser(tokens.idToken, signIn.issuer),
})

export const providerPagesOff: SignInRefusal = { code: 'PROVIDER_PAGES_OFF', message: 'This provider signs in with a token only, not through its pages.' }

// Where a browser starts out to a provider's pages, to sign in or to connect it, and the body field naming the provider.
const pagePaths: Record<string, 'provider' | 'providerId'> = { '/sign-in/social': 'provider', '/link-social': 'provider', '/sign-in/oauth2': 'providerId', '/oauth2/link': 'providerId' }

/** Whether a request starts sending a browser through the pages of one of `providers`, rather than posting an ID token. */
export const startsProviderPages = (path: string | undefined, body: unknown, providers: string[]) => {
  const field = path === undefined ? undefined : pagePaths[path]
  if (!field || typeof body !== 'object' || body === null) return false
  const named = body as Record<string, unknown>
  return providers.includes(named[field] as string) && named.idToken === undefined
}

/**
 * Refuses sending anyone through the pages of the platform's `providers` that have no client secret (`403
 * PROVIDER_PAGES_OFF`): to sign in, or to connect one from the account page. Token sign-in alone stays.
 */
export const providerPagesOffPlugin = (providers: string[]) =>
  ({
    id: 'protobase-provider-pages-off',
    hooks: {
      before: [
        {
          matcher: (context) => startsProviderPages(context.path, context.body, providers),
          handler: createAuthMiddleware(async () => {
            throw new APIError('FORBIDDEN', providerPagesOff)
          }),
        },
      ],
    },
  }) satisfies BetterAuthPlugin
