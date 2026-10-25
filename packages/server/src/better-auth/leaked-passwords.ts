import type { BetterAuthPlugin } from 'better-auth'
import { APIError, createAuthMiddleware } from 'better-auth/api'
import { haveIBeenPwned, isPasswordCompromised } from 'better-auth/plugins/haveibeenpwned'
import { passwordLength } from './new-account-password'
import { setPasswordPath } from './set-password'
import { signUpPaths } from './sign-up/sign-up-plugin'

const { PASSWORD_COMPROMISED } = haveIBeenPwned().$ERROR_CODES

const leakedPasswordMessage = 'This password appears in a known data breach. Choose a different one.'

// Every endpoint that sets a password someone chose, with the body field that holds it: Better Auth's own, and
// Protobase's sign-up, invitation and first password.
const passwordFields: Record<string, 'password' | 'newPassword'> = {
  '/sign-up/email': 'password',
  '/change-password': 'newPassword',
  '/reset-password': 'newPassword',
  '/admin/create-user': 'password',
  '/admin/set-user-password': 'newPassword',
  [setPasswordPath]: 'newPassword',
  [signUpPaths.create]: 'password',
  '/invitation/sign-up': 'password',
}

/** Refuses a password from the Have I Been Pwned corpus with `400 PASSWORD_COMPROMISED`, as Better Auth's plugin does. */
export const rejectLeakedPassword = async (password: string) => {
  if (!(await isPasswordCompromised(password))) return
  throw APIError.from('BAD_REQUEST', { code: PASSWORD_COMPROMISED.code, message: leakedPasswordMessage })
}

/**
 * Better Auth's haveIBeenPwned check, on every endpoint of `passwordFields`. It runs before the endpoint, where the
 * plugin itself checks only once the password is hashed: admin account creation, invitation sign-up and sign-up have
 * made the account or used the ticket by then. Only the first five characters of the password's SHA-1 hash leave the
 * server; a password outside the allowed lengths is left to the endpoint, which refuses it without a lookup. When the
 * list cannot be reached, the request fails with a 500.
 */
export const leakedPasswordsPlugin = () =>
  ({
    id: 'protobase-leaked-passwords',
    hooks: {
      before: [
        {
          matcher: (ctx) => ctx.path !== undefined && Object.hasOwn(passwordFields, ctx.path),
          handler: createAuthMiddleware(async (ctx) => {
            const password = (ctx.body as Record<string, unknown> | undefined)?.[passwordFields[ctx.path!]!]
            if (typeof password !== 'string' || password.length < passwordLength.min || password.length > passwordLength.max) return
            await rejectLeakedPassword(password)
          }),
        },
      ],
    },
    $ERROR_CODES: { PASSWORD_COMPROMISED },
  }) satisfies BetterAuthPlugin
