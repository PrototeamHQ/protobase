import { APIError } from 'better-auth/api'
import { forbidden, unauthorized } from '../problem'

/** What `betterAuthSessionToken` needs of the auth instance: the session read, and the jwt plugin's `getToken`. */
export type TokenAuth = {
  api: {
    getSession: (input: { headers: Headers; query: { disableRefresh: boolean } }) => Promise<unknown>
    getToken: (input: { headers: Headers }) => Promise<{ token: string }>
  }
}

const messageOf = (body: unknown) => {
  const message = (body as { message?: unknown } | undefined)?.message
  return typeof message === 'string' ? message : 'Signing in is refused'
}

/**
 * The bearer token of the session a request's cookie carries, minted as `GET /api/auth/token` would, with the same
 * plugin hooks (the sign-in policy's hold-back included). The direct call has no rate limit, so nothing before the
 * signature check may read the store: the session is read first, which refuses a cookie that is missing, forged or for
 * no session before any store read, and the policy is read only for a session that exists. No session is a 401
 * problem, a refusal a 403 with Better Auth's message; any other error, such as a store failure, stays as it is.
 */
export const betterAuthSessionToken = (auth: TokenAuth) => async (request: Request) => {
  const session = await auth.api.getSession({ headers: request.headers, query: { disableRefresh: true } })
  if (session === null) throw unauthorized('Sign in first')
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
