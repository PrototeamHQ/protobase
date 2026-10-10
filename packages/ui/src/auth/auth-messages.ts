import type { AuthError } from '@protobase/client'

const tooManyRequests = 'Too many attempts. Wait a minute and try again.'
const passkeyClosed = 'The passkey prompt closed before it finished. Try again.'

// Better Auth's codes for the person at the keyboard; anything else shows the server's own message.
const messages: Record<string, string> = {
  INVALID_EMAIL_OR_PASSWORD: 'The email or password is not right.',
  INVALID_PASSWORD: 'The password is not right.',
  INVALID_OTP: 'The code is not right.',
  OTP_EXPIRED: 'The code has expired. Ask for a new one.',
  TOO_MANY_ATTEMPTS: 'Too many wrong codes. Ask for a new one.',
  INVALID_CODE: 'The code is not right.',
  INVALID_BACKUP_CODE: 'The backup code is not right, or was used before.',
  TOO_MANY_ATTEMPTS_REQUEST_NEW_CODE: 'Too many wrong codes. Sign in again.',
  ACCOUNT_TEMPORARILY_LOCKED: 'Too many wrong codes. Wait 15 minutes and try again.',
  INVALID_TWO_FACTOR_COOKIE: 'This sign-in took too long. Sign in again.',
  AUTH_CANCELLED: passkeyClosed,
  ERROR_CEREMONY_ABORTED: passkeyClosed,
  REGISTRATION_CANCELLED: passkeyClosed,
  PASSKEY_NOT_FOUND: 'This passkey is not registered for an account here.',
  AUTHENTICATION_FAILED: 'The passkey could not be checked. Try again.',
  PREVIOUSLY_REGISTERED: 'This passkey is added already.',
  ERROR_AUTHENTICATOR_PREVIOUSLY_REGISTERED: 'This passkey is added already.',
  SESSION_NOT_FRESH: 'For this change, sign out and sign in again first.',
}

const known = (error: AuthError) => (error.code ? messages[error.code] : undefined)

/** Better Auth's error from a sign-in step or an account change, in words for the person at the keyboard. */
export const authMessage = (error: AuthError) => known(error) ?? (error.status === 429 ? tooManyRequests : error.message)

/** As `authMessage`, for the password form: any other 401 is a wrong email or password. */
export const signInMessage = (error: AuthError) => known(error) ?? (error.status === 429 ? tooManyRequests : error.status === 401 ? messages.INVALID_EMAIL_OR_PASSWORD! : error.message)
