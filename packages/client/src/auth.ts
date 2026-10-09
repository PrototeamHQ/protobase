import { createAuthClient } from 'better-auth/client'
import { jwtClient } from 'better-auth/client/plugins'

export type AuthUser = { id: string; email: string; name: string; role?: string | null }

/** A failed sign-in or sign-out, with Better Auth's status and code (for example `INVALID_EMAIL_OR_PASSWORD`). */
export class AuthError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(message)
    this.name = 'AuthError'
  }
}

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

/** `needsAdmin` while no user exists yet; `passwordReset` when the server can email reset links; `socialProviders` the ids of the sign-in providers, for example `github`. */
export type SetupStatus = { needsAdmin: boolean; passwordReset: boolean; socialProviders: string[] }

/**
 * The browser side of Better Auth: sign in with email and password, and a short-lived JWT held in memory only
 * (never in storage), fetched with the session cookie and refreshed before it expires.
 */
export const createAuthSession = (options: AuthSessionOptions = {}) => {
  const origin = options.origin ?? globalThis.location?.origin ?? 'http://localhost'
  const basePath = options.basePath ?? '/api/auth'
  const margin = options.refreshMarginMs ?? 60_000
  const doFetch = options.fetch ?? ((input, init) => fetch(input, init))
  const client = createAuthClient({ baseURL: origin, basePath, plugins: [jwtClient()], fetchOptions: { customFetchImpl: doFetch as typeof fetch } })

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

    /** Whether the first admin is still missing. Every server has a login, so a 404 means the URL is not a Protobase server. */
    status: async (): Promise<SetupStatus> => {
      const response = await doFetch(`${origin}${basePath}/status`)
      if (response.status === 404) throw new AuthError('This server has no sign-in. Is the API URL right?', 404)
      if (!response.ok) throw new AuthError('Could not read the sign-in status', response.status)
      const body = (await response.json()) as { needsAdmin?: boolean; passwordReset?: boolean; socialProviders?: string[] }
      return { needsAdmin: Boolean(body.needsAdmin), passwordReset: Boolean(body.passwordReset), socialProviders: body.socialProviders ?? [] }
    },

    /** The signed-in user from the session cookie, or `undefined`. */
    session: async (): Promise<AuthUser | undefined> => {
      const { data } = await client.getSession()
      return data?.user as AuthUser | undefined
    },

    signIn: async (email: string, password: string): Promise<AuthUser> => {
      const { data, error } = await client.signIn.email({ email, password })
      if (error || !data) throw new AuthError(error?.message || 'Sign-in failed', error?.status ?? 500, error?.code)
      await token({ refresh: true })
      return data.user as AuthUser
    },

    /**
     * Starts sign-in with a provider such as `github`: resolves with the provider's authorization URL, for the page to go to.
     * The provider sends the browser back to `callbackURL` signed in, or with `?error=<code>`.
     */
    signInSocial: async (provider: string, callbackURL: string) => {
      const { data, error } = await client.signIn.social({ provider, callbackURL, errorCallbackURL: callbackURL, disableRedirect: true })
      if (error || !data?.url) throw new AuthError(error?.message || 'Sign-in failed', error?.status ?? 500, error?.code)
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
      if (error) throw new AuthError(error.message || 'Could not send the reset link', error.status, error.code)
    },

    /** Sets a new password with the token from a reset link; the link works once. */
    resetPassword: async (token: string, newPassword: string) => {
      const { error } = await client.resetPassword({ token, newPassword })
      if (error) throw new AuthError(error.message || 'Could not set the password', error.status, error.code)
    },
  }
}

export type AuthSession = ReturnType<typeof createAuthSession>

/**
 * A session that is already signed in with a token you hold, for stories and scripts (`protobase token <email>`).
 * It never refreshes, so use a token that outlives the run.
 */
export const createStaticSession = (token: string, user: AuthUser = { id: 'token', email: 'token', name: 'API token', role: null }): AuthSession => ({
  token: async () => token,
  status: async () => ({ needsAdmin: false, passwordReset: false, socialProviders: [] }),
  session: async () => user,
  signIn: async () => user,
  signInSocial: async () => {
    throw new AuthError('A static session cannot sign in with a provider', 400)
  },
  signOut: async () => undefined,
  requestPasswordReset: async () => undefined,
  resetPassword: async () => undefined,
})
