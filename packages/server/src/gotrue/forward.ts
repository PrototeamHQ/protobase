import { authBasePath } from '../better-auth/auth-base-path'
import type { AdminAuth } from '../better-auth/create-auth'
import { fromBetterAuth, GoTrueError } from './errors'

// Headers of the client's request that Better Auth's endpoint does not get: its credentials are the endpoint's body
// alone, and it is called by the app itself, on the origin the client called.
const withheld = ['cookie', 'authorization', 'origin', 'referer', 'content-length', 'content-type']

const parsed = (text: string): Record<string, unknown> | undefined => (text ? JSON.parse(text) : undefined)

/**
 * Posts `body` to Better Auth's endpoint at `path`, such as `/sign-in/email`, for the client's `request`: with its
 * other headers, so the rate limits and the session made count the client's address and agent. Answers the endpoint's
 * JSON and headers; a refusal is thrown as GoTrue's.
 */
export const callBetterAuth = async (auth: AdminAuth, request: Request, path: string, body: Record<string, unknown>) => {
  const headers = new Headers(request.headers)
  for (const name of withheld) headers.delete(name)
  const origin = new URL(request.url).origin
  headers.set('content-type', 'application/json')
  headers.set('origin', origin)
  const response = await auth.handler(new Request(`${origin}${authBasePath}${path}`, { method: 'POST', headers, body: JSON.stringify(body) }))
  const json = parsed(await response.text())
  if (!response.ok) throw fromBetterAuth(response.status, json)
  return { json: json ?? {}, headers: response.headers }
}

/**
 * The session token a Better Auth sign-in answers. Someone with two-factor authentication gets none yet, only the
 * second step, which is not offered here: GoTrue's `insufficient_aal`.
 */
export const signedInToken = (json: Record<string, unknown>) => {
  if (typeof json.token !== 'string') throw new GoTrueError(403, 'insufficient_aal', 'This account signs in with a second factor, which is not offered here')
  return json.token
}
