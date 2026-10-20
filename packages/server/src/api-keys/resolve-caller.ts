import { createHash, timingSafeEqual } from 'node:crypto'
import type { JWTPayload } from 'jose'
import { unauthorized } from '../problem'
import type { ApiKeys } from './api-key-settings'

/**
 * Who a key-admitted request runs as. `anon` and `authenticated` are the database roles of the same names; `app` is
 * the app's own role, the one that owns its tables. `claims` are those of the signed-in user's token, or for the keys
 * alone the `role` claim that Supabase gives them, so `auth.jwt()` reads the same.
 */
export type Caller =
  | { role: 'anon'; claims: { role: 'anon' } }
  | { role: 'authenticated'; claims: JWTPayload }
  | { role: 'app'; claims: { role: 'service_role' } }

export type CallerOptions = {
  keys: ApiKeys
  /** Verifies a user's token against the app's key set and returns its claims, such as `jwtVerifier(betterAuthTokens(...))`. */
  verify: (token: string) => Promise<JWTPayload>
}

const digest = (text: string) => createHash('sha256').update(text).digest()

// Compares digests, which have the same length, so the time taken tells nothing about the key.
const sameKey = (given: string, key: string | undefined) => key !== undefined && timingSafeEqual(digest(given), digest(key))

const isJwt = (token: string) => token.split('.').length === 3

/**
 * Resolves the `apikey` header and `Authorization: Bearer` of a request to its caller. The key picks the role: the
 * publishable key is `anon`, the secret key `app`. A user's token in the bearer makes either `authenticated` with its
 * claims. A bearer that is no token must be the key itself, as supabase-js sends it when nobody is signed in. A
 * missing or wrong key, a wrong bearer or a token that does not verify or names no user is a 401 problem.
 */
export const apiKeyCaller = (options: CallerOptions) => async (request: Request): Promise<Caller> => {
  const key = request.headers.get('apikey')?.trim()
  if (!key) throw unauthorized('Send the app\'s publishable or secret key in the apikey header')
  const publishable = sameKey(key, options.keys.publishable)
  if (!publishable && !sameKey(key, options.keys.secret)) throw unauthorized('The apikey header holds no key of this app')

  const header = request.headers.get('authorization')
  const [scheme, bearer] = header?.split(' ') ?? []
  if (header !== null && (scheme?.toLowerCase() !== 'bearer' || !bearer)) throw unauthorized('Send a bearer token in the Authorization header')
  if (bearer !== undefined && isJwt(bearer)) {
    const claims = await options.verify(bearer)
    if (!claims.sub) throw unauthorized('The bearer token has no subject')
    return { role: 'authenticated', claims }
  }
  if (bearer !== undefined && !sameKey(bearer, key)) throw unauthorized('The bearer is neither a token nor the key in the apikey header')
  return publishable ? { role: 'anon', claims: { role: 'anon' } } : { role: 'app', claims: { role: 'service_role' } }
}
