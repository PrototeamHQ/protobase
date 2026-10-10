import { accountSecurity } from './account-security'
import { AuthError, authError } from './auth-error'
import type { AuthUser, SetupStatus, SignInMethod } from './auth-types'
import { betterAuthClient } from './better-auth-client'
import { signInFlows } from './sign-in-flows'
import { signInPolicyClient } from './sign-in-policy'

export { AuthError }

export type AuthSessionOptions = {
  /** Origin of the server; defaults to the page's own. */
  origin?: string
  /** Where Better Auth is mounted. */
  basePath?: string
  fetch?: typeof fetch
  /** Refresh this long before the token expires. */
  refreshMarginMs?: number
  /** Called when a background refresh finds the session gone. */
  onSignedOut?: () => void
}

/** The expiry of a JWT in milliseconds, read from its payload (the signature is the server's business). */
export const tokenExpiry = (token: string) => {
  const payload = token.split('.')[1]
  if (!payload) throw new Error('Not a JWT')
  const json = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')))
  if (typeof json.exp !== 'number') throw new Error('The token has no expiry')
  return json.exp * 1000
}

/**
 * The browser side of Better Auth: sign in with a password, an emailed code or a passkey (with a second step for an
 * account with two-factor authentication), the account's passkeys and two-factor authentication (`account`), the
 * sign-in policy for admins (`signInPolicy`), and a short-lived JWT held in memory only (never in storage), fetched
 * with the session cookie and refreshed before it expires.
 */
export const createAuthSession = (options: AuthSessionOptions = {}) => {
  const origin = options.origin ?? globalThis.location?.origin ?? 'http://localhost'
  const basePath = options.basePath ?? '/api/auth'
  const margin = options.refreshMarginMs ?? 60_000
  const doFetch = options.fetch ?? ((input, init) => fetch(input, init))
  const client = betterAuthClient(origin, basePath, doFetch as typeof fetch)

  let cached: { token: string; expiresAt: number } | undefined
  let pending: Promise<string | undefined> | undefined
  let timer: ReturnType<typeof setTimeout> | undefined

  const forget = () => {
    cached = undefined
    clearTimeout(timer)
  }

  const load = async () => {
    const { data } = await client.$fetch<{ token: string }>('/token')
    if (!data?.token) {
      forget()
      return undefined
    }
    cached = { token: data.token, expiresAt: tokenExpiry(data.token) }
    clearTimeout(timer)
    timer = setTimeout(() => void token({ refresh: true }).then((fresh) => fresh || options.onSignedOut?.()), Math.max(1000, cached.expiresAt - Date.now() - margin))
    return cached.token
  }

  /** The bearer token; a cached one is reused until it is within the margin of expiring. `undefined` when signed out. */
  const token = async ({ refresh = false }: { refresh?: boolean } = {}) => {
    if (!refresh && cached && cached.expiresAt - Date.now() > margin) return cached.token
    pending ??= load().finally(() => {
      pending = undefined
    })
    return pending
  }

  return {
    token,

    /**
     * Whether the first admin is still missing, and how people can sign in. Every server has a login, so a 404 means the
     * URL is not a Protobase server. A server from before sign-in methods were listed offers passwords only.
     */
    status: async (): Promise<SetupStatus> => {
      const response = await doFetch(`${origin}${basePath}/status`)
      if (response.status === 404) throw new AuthError('This server has no sign-in. Is the API URL right?', 404)
      if (!response.ok) throw new AuthError('Could not read the sign-in status', response.status)
      const body = (await response.json()) as { needsAdmin?: boolean; signInMethods?: SignInMethod[]; passwordReset?: boolean; socialProviders?: string[] }
      return { needsAdmin: Boolean(body.needsAdmin), signInMethods: body.signInMethods ?? ['password'], passwordReset: Boolean(body.passwordReset), socialProviders: body.socialProviders ?? [] }
    },

    /** The signed-in user from the session cookie, or `undefined`. */
    session: async (): Promise<AuthUser | undefined> => {
      const { data } = await client.getSession()
      return data?.user as AuthUser | undefined
    },

    ...signInFlows(client, () => token({ refresh: true })),

    /**
     * Starts sign-in with a provider such as `github`: resolves with the provider's authorization URL, for the page to go to.
     * The provider sends the browser back to `callbackURL` signed in, or with `?error=<code>`.
     */
    signInSocial: async (provider: string, callbackURL: string) => {
      const { data, error } = await client.signIn.social({ provider, callbackURL, errorCallbackURL: callbackURL, disableRedirect: true })
      if (error || !data?.url) throw authError(error, 'Sign-in failed')
      return data.url
    },

    signOut: async () => {
      forget()
      await client.signOut()
    },

    /**
     * Emails a reset link when an account has this address; the answer is the same either way. The link leads back to
     * `redirectTo`, with `token` (or `error=INVALID_TOKEN`) added to its query.
     */
    requestPasswordReset: async (email: string, redirectTo: string) => {
      const { error } = await client.requestPasswordReset({ email, redirectTo })
      if (error) throw authError(error, 'Could not send the reset link')
    },

    /** Sets a new password with the token from a reset link; the link works once. */
    resetPassword: async (token: string, newPassword: string) => {
      const { error } = await client.resetPassword({ token, newPassword })
      if (error) throw authError(error, 'Could not set the password')
    },

    account: accountSecurity(client),
    signInPolicy: signInPolicyClient(client),
  }
}

export type AuthSession = ReturnType<typeof createAuthSession>
