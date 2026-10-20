import { errors, jwtVerify } from 'jose'
import { GoTrueError } from './errors'
import type { goTrueTokens } from './access-tokens'

export type AccessClaims = { sub: string; session_id: string }

/**
 * Reads the signed-in user's access token from `Authorization: Bearer`, verified with the keys, issuer and audience of `goTrueTokens`:
 * its user and session. Without one, GoTrue's `no_authorization`; one that does not verify is `bad_jwt`.
 */
export const accessClaimsOf = ({ keys, ...expected }: ReturnType<typeof goTrueTokens>) => async (request: Request): Promise<AccessClaims> => {
  const [scheme, token] = (request.headers.get('authorization') ?? '').split(' ')
  if (scheme?.toLowerCase() !== 'bearer' || !token) throw new GoTrueError(401, 'no_authorization', 'This endpoint requires a valid Bearer token')
  const { payload } = await jwtVerify(token, keys, expected).catch((error: unknown) => {
    if (error instanceof errors.JOSEError) throw new GoTrueError(403, 'bad_jwt', 'invalid JWT: unable to parse or verify signature, token is invalid or expired')
    throw error
  })
  if (typeof payload.sub !== 'string' || typeof payload.session_id !== 'string') throw new GoTrueError(403, 'bad_jwt', 'invalid JWT: it names no user and session')
  return { sub: payload.sub, session_id: payload.session_id }
}
