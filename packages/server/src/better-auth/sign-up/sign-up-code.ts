import { APIError } from 'better-auth/api'
import type { AuthContext } from '../organizations/store'

// The code that proves someone reads the address they sign up with, kept in Better Auth's verification table: hashed,
// for five minutes, and for three tries; a fourth try finds it gone. Web Crypto only, like the rest of the server.

/** How long the emailed code works, in seconds and in the email's words. */
export const signUpCodeLifetimeSeconds = 5 * 60
export const signUpCodeLifetime = '5 minutes'

const allowedAttempts = 3

const identifierOf = (email: string) => `sign-up-otp-${email}`

const hashOf = async (code: string) => {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(code))
  return btoa(String.fromCharCode(...new Uint8Array(digest)))
}

// Six digits from a uniform draw: 2^32 is not a multiple of a million, so draws past the last whole million are retried.
const sixDigits = () => {
  const limit = Math.floor(2 ** 32 / 1_000_000) * 1_000_000
  for (;;) {
    const [value] = crypto.getRandomValues(new Uint32Array(1))
    if (value! < limit) return String(value! % 1_000_000).padStart(6, '0')
  }
}

const invalidCode = () => new APIError('BAD_REQUEST', { code: 'SIGN_UP_CODE_INVALID', message: 'The code is not right, or has expired. Ask for a new one.' })

/** A new code for `email`, replacing any earlier one; the store keeps only its hash. */
export const issueSignUpCode = async (context: AuthContext, email: string) => {
  const code = sixDigits()
  const identifier = identifierOf(email)
  await context.internalAdapter.deleteVerificationByIdentifier(identifier)
  await context.internalAdapter.createVerificationValue({ identifier, value: `${await hashOf(code)}:0`, expiresAt: new Date(Date.now() + signUpCodeLifetimeSeconds * 1000) })
  return code
}

/**
 * Takes the code for `email` when `code` is it, so it works once; a wrong one counts a try. Taking the stored value is
 * atomic, so of two requests with the right code only one gets through. Throws `SIGN_UP_CODE_INVALID` otherwise.
 */
export const consumeSignUpCode = async (context: AuthContext, email: string, code: string) => {
  const identifier = identifierOf(email)
  const consumed = await context.internalAdapter.consumeVerificationValue(identifier)
  if (!consumed || new Date(consumed.expiresAt) < new Date()) throw invalidCode()
  const separator = consumed.value.lastIndexOf(':')
  const hash = consumed.value.slice(0, separator)
  const attempts = Number(consumed.value.slice(separator + 1)) + 1
  if (hash === (await hashOf(code))) return
  if (attempts < allowedAttempts) await context.internalAdapter.createVerificationValue({ identifier, value: `${hash}:${attempts}`, expiresAt: new Date(consumed.expiresAt) })
  throw invalidCode()
}
