import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto'

/** A workspace credential as the relay keeps it: its id, its origin and the SHA-256 of its secret. */
export type StoredCredential = { id: string; origin: string; secretHash: Buffer }

// `<id>.<secret>`: a UUID, then 32 random bytes in base64url. It fits the bearer token the relay sender takes.
const credentialPattern = /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.([A-Za-z0-9_-]{43})$/

export const secretHash = (secret: string) => createHash('sha256').update(secret).digest()

/** A new credential: the text to give the workspace once, and what the relay keeps of it. */
export const newCredential = (origin: string) => {
  const id = randomUUID()
  const secret = randomBytes(32).toString('base64url')
  return { text: `${id}.${secret}`, stored: { id, origin, secretHash: secretHash(secret) } satisfies StoredCredential }
}

/** The id and secret of a credential's text, or `undefined` when it is not one. */
export const parseCredential = (text: string) => {
  const match = credentialPattern.exec(text)
  if (!match) return
  return { id: match[1]!, secret: match[2]! }
}

/** Whether `secret` is the stored credential's, compared in constant time. */
export const secretMatches = (stored: StoredCredential, secret: string) => timingSafeEqual(stored.secretHash, secretHash(secret))
