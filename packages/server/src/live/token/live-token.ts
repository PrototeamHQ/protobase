import { EncryptJWT } from 'jose'

/**
 * Who a live token is for: a signed-in person in their sign-in session, which ends it, or a visitor, bound to nothing.
 * `expiresAt` is when it stops being taken.
 */
export type LiveSubject = { user: string; session: string; expiresAt: Date } | { anonymous: true; expiresAt: Date }

/**
 * What a live token holds besides its subject: the resource, `where`, the read's filter on the row alone as filter text
 * (none when the read keeps no row out), the fields whose values a subscriber may get, and `snapshot`, the read's
 * `pg_current_snapshot()`, which tells which transactions the read saw.
 */
export type LiveRead = { resource: string; where?: string; fields: string[]; snapshot: string }

/** The largest token sent: the response's whole header block stays under a proxy's default 4 KB buffer. */
export const maxLiveTokenBytes = 3000

/**
 * The read sealed as a JWE (`dir`, A256GCM) with the live token key, so its caller can neither read nor change the
 * conditions, which may hold keys of records they cannot see. Undefined when it is longer than `maxLiveTokenBytes`.
 */
export const sealLiveToken = async (key: Uint8Array, app: string, read: LiveRead, subject: LiveSubject, now = new Date()) => {
  const claims = { ...read, ...('session' in subject ? { sid: subject.session } : { anonymous: true }) }
  const jwt = new EncryptJWT(claims)
    .setProtectedHeader({ alg: 'dir', enc: 'A256GCM', typ: 'JWT' })
    .setIssuer(app)
    .setIssuedAt(Math.floor(now.getTime() / 1000))
    .setExpirationTime(Math.floor(subject.expiresAt.getTime() / 1000))
  if ('user' in subject) jwt.setSubject(subject.user)
  const token = await jwt.encrypt(key)
  return token.length > maxLiveTokenBytes ? undefined : token
}
