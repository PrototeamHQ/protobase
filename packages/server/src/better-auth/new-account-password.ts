import { APIError } from 'better-auth/api'
import type { SignInPolicy } from './sign-in-policy'

// The lengths the app requires of every new password: here for sign-up and invitations, and as Better Auth's
// minPasswordLength and maxPasswordLength (create-auth.ts) for its sign-up and reset. Sign-in checks only the maximum.
export const passwordLength = { min: 12, max: 128 }
const { min: minPasswordLength, max: maxPasswordLength } = passwordLength

/**
 * Checks the password someone chose for a new account they make themselves, from an invitation or by signing up,
 * against the effective sign-in policy: none while passwords are forbidden, one unless emailed codes are allowed, and
 * of the length Better Auth's own sign-in takes.
 */
export const checkNewAccountPassword = (policy: SignInPolicy, password: string | undefined) => {
  if (password !== undefined && policy.password === 'forbidden') {
    throw new APIError('BAD_REQUEST', { code: 'SIGN_IN_METHOD_FORBIDDEN', message: 'This app does not sign in with passwords; leave the password out.' })
  }
  if (password === undefined && policy.emailCode !== 'allowed') {
    throw new APIError('BAD_REQUEST', { code: 'PASSWORD_REQUIRED', message: 'Choose a password to sign in with.' })
  }
  if (password !== undefined && (password.length < minPasswordLength || password.length > maxPasswordLength)) {
    throw new APIError('BAD_REQUEST', { code: 'PASSWORD_LENGTH', message: `Choose a password of ${minPasswordLength} to ${maxPasswordLength} characters.` })
  }
}
