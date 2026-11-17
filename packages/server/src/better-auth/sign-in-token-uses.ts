import { createHash } from 'node:crypto'
import type { JWTPayload } from 'jose'
import type { AuthContext } from './organizations/store'
import { clockToleranceSeconds } from './sign-in-token'

type Stores = Pick<AuthContext, 'adapter'> & { internalAdapter: Pick<AuthContext['internalAdapter'], 'createVerificationValue' | 'findVerificationValue'> }

// Kept in Better Auth's verification table, which every store has, so recording them needs no migration. A token is
// known by its issuer and the SHA-256 of its claims, not of its text: the same signed claims can be written as other
// text (another base64url spelling, or an ECDSA signature's twin), which would otherwise count as a new token.
const usedIdentifier = (issuer: string, claims: JWTPayload) => `protobase-sign-in-token-${createHash('sha256').update(`${issuer} ${JSON.stringify(claims)}`).digest('base64url')}`
const sessionIdentifier = (sessionId: string) => `protobase-token-session-${sessionId}`

/**
 * Records that the token with the verified `claims` signed in, until it expires (their `exp`, in seconds), and tells
 * whether this is its first use. Two uses at once both record theirs, so both count as a second use and neither signs
 * in. Two tokens with the same claims are one token: the second is refused.
 */
export const useSignInToken = async ({ adapter, internalAdapter }: Stores, claims: JWTPayload & { iss: string; exp: number }) => {
  const identifier = usedIdentifier(claims.iss, claims)
  await internalAdapter.createVerificationValue({ identifier, value: 'used', expiresAt: new Date((claims.exp + clockToleranceSeconds) * 1000) })
  return (await adapter.count({ model: 'verification', where: [{ field: 'identifier', value: identifier }] })) === 1
}

/** Notes that the session began with a sign-in token; the note ends with the session. */
export const saveTokenSession = async ({ internalAdapter }: Pick<Stores, 'internalAdapter'>, session: { id: string; expiresAt: Date }) => {
  await internalAdapter.createVerificationValue({ identifier: sessionIdentifier(session.id), value: 'token', expiresAt: session.expiresAt })
}

/** Whether the session began with a sign-in token, so its age proves nothing: the client may mint a fresh one at will. */
export const isTokenSession = async ({ internalAdapter }: Pick<Stores, 'internalAdapter'>, sessionId: string) => Boolean(await internalAdapter.findVerificationValue(sessionIdentifier(sessionId)))
