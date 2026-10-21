import { APIError } from 'better-auth/api'
import { forbidden, unauthorized } from '../problem'

/** What `betterAuthSessionToken` needs of the auth instance: the jwt plugin's `getToken`. */
export type TokenAuth = { api: { getToken: (input: { headers: Headers }) => Promise<{ token: string }> } }

const messageOf = (body: unknown) => {
  const message = (body as { message?: unknown } | undefined)?.message
  return typeof message === 'string' ? message : 'Signing in is refused'
}

/**
 * The bearer token of the session a request's cookie carries, minted as `GET /api/auth/token` would, with the same
 * plugin hooks (the sign-in policy's hold-back included) but without its rate limit: a forged cookie fails its
 * signature before any store read. No session is a 401 problem, a refusal a 403 with Better Auth's message; any other
 * error stays as it is.
 */
export const betterAuthSessionToken = (auth: TokenAuth) => async (request: Request) => {
  try {
    const { token } = await auth.api.getToken({ headers: request.headers })
    return token
  } catch (error) {
    if (!(error instanceof APIError)) throw error
    if (error.statusCode === 401) throw unauthorized('Sign in first')
    if (error.statusCode === 403) throw forbidden('sign-in-refused', messageOf(error.body))
    throw error
  }
}
