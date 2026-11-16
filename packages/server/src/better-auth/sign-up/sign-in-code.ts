import type { AuthContext } from '../organizations/store'
import { codeLifetimeSeconds } from '../sign-in-mail'
import { sixDigits } from './sign-up-code'

// A sign-in code as Better Auth's email OTP plugin keeps the ones it mails, so its `/sign-in/email-otp` takes it: at
// `sign-in-otp-<address>`, the code's SHA-256 in base64url without padding, then `:` and the wrong tries so far, of
// three. The plugin mails none to an address without an account; these are for one that sign-up makes on the spot.
// Written against better-auth 1.7.12.

const allowedAttempts = 3

const identifierOf = (email: string) => `sign-in-otp-${email}`

const hashOf = async (code: string) => {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(code))
  return btoa(String.fromCharCode(...new Uint8Array(digest))).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '')
}

/** A new sign-in code for `email`, for as long as every emailed code works; an earlier one stops working. The store keeps only its hash. */
export const issueSignInCode = async (context: AuthContext, email: string) => {
  const code = sixDigits()
  const identifier = identifierOf(email)
  await context.internalAdapter.deleteVerificationByIdentifier(identifier)
  await context.internalAdapter.createVerificationValue({ identifier, value: `${await hashOf(code)}:0`, expiresAt: new Date(Date.now() + codeLifetimeSeconds * 1000) })
  return code
}

/**
 * Whether `code` is the sign-in code `email` has now: not expired, nor out of tries. It neither takes the code nor
 * counts a try, as the plugin does both when it checks the code next.
 */
export const isSignInCode = async (context: AuthContext, email: string, code: string) => {
  const stored = await context.internalAdapter.findVerificationValue(identifierOf(email))
  if (!stored || new Date(stored.expiresAt) < new Date()) return false
  const separator = stored.value.lastIndexOf(':')
  if (Number(stored.value.slice(separator + 1)) >= allowedAttempts) return false
  return stored.value.slice(0, separator) === (await hashOf(code))
}
