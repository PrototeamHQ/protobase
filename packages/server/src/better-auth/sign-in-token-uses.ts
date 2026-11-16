import { createHash } from 'node:crypto'
import type { AuthContext } from './organizations/store'
import { clockToleranceSeconds } from './sign-in-token'

type Stores = Pick<AuthContext, 'adapter'> & { internalAdapter: Pick<AuthContext['internalAdapter'], 'createVerificationValue' | 'findVerificationValue'> }

// Kept in Better Auth's verification table, which every store has, so recording them needs no migration. A token's id
// is the issuer's, so it is hashed with the issuer into an identifier of a fixed length.
const usedIdentifier = (issuer: string, jti: string) => `protobase-sign-in-token-${createHash('sha256').update(`${issuer} ${jti}`).digest('base64url')}`
const sessionIdentifier = (sessionId: string) => `protobase-token-session-${sessionId}`

/**
 * Records that the token `jti` of `issuer` signed in, until it expires (`exp`, in seconds), and tells whether this is
 * its first use. Two uses at once both record theirs, so both count as a second use and neither signs in.
 */
export const useSignInToken = async ({ adapter, internalAdapter }: Stores, issuer: string, jti: string, exp: number) => {
  const identifier = usedIdentifier(issuer, jti)
  await internalAdapter.createVerificationValue({ identifier, value: 'used', expiresAt: new Date((exp + clockToleranceSeconds) * 1000) })
  return (await adapter.count({ model: 'verification', where: [{ field: 'identifier', value: identifier }] })) === 1
}

/** Notes that the session began with a sign-in token; the note ends with the session. */
export const saveTokenSession = async ({ internalAdapter }: Pick<Stores, 'internalAdapter'>, session: { id: string; expiresAt: Date }) => {
  await internalAdapter.createVerificationValue({ identifier: sessionIdentifier(session.id), value: 'token', expiresAt: session.expiresAt })
}

/** Whether the session began with a sign-in token, so its age proves nothing: the client may mint a fresh one at will. */
export const isTokenSession = async ({ internalAdapter }: Pick<Stores, 'internalAdapter'>, sessionId: string) => Boolean(await internalAdapter.findVerificationValue(sessionIdentifier(sessionId)))
