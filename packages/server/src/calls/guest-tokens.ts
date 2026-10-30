import { createHash, randomBytes } from 'node:crypto'

/** What starts a guest link's token, and a guest's: neither is ever a session token, a JWT or an API key. */
export const linkTokenPrefix = 'pbgl_'
export const guestTokenPrefix = 'pbg_'

/** A new token, 32 random bytes in base64url after its prefix. */
export const newToken = (prefix: string) => `${prefix}${randomBytes(32).toString('base64url')}`

/** The SHA-256 a token is stored and looked up by; `undefined` for a value that is no token of this kind. */
export const tokenHash = (prefix: string, token: unknown) => {
  if (typeof token !== 'string' || !token.startsWith(prefix) || token.length !== prefix.length + 43) return
  return createHash('sha256').update(token).digest()
}

/** The member a guest is in their call: no `calls.join` takes a member of this form. */
export const guestMember = (guest: string) => `guest:${guest}`
export const isGuestMember = (member: string) => member.startsWith('guest:')
