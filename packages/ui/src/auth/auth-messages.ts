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

// Why a staff sign-in did not go through, by the code the server's staff callback or start answers with.
const staffMessages: Record<string, string> = {
  STAFF_PERMISSION_MISSING: 'Your staff account has no permission to sign in as people here.',
  STAFF_SIGN_IN_NOT_STRONG: 'Sign in to your staff account with a passkey or a second step, then try again.',
  STAFF_SIGN_IN_STALE: 'Your staff sign-in is too old. Sign in to your staff account again.',
  STAFF_SIGN_IN_EXPIRED: 'This staff sign-in took too long or was used already. Start again.',
  STAFF_SIGN_IN_FAILED: 'The staff sign-in did not go through at the provider. Try again.',
  STAFF_USER_UNAVAILABLE: 'There is no account with this address, or it is disabled.',
  STAFF_REASON_REQUIRED: 'Say why you sign in as this person, in at least 10 characters.',
  SIGN_IN_METHOD_FORBIDDEN: 'Staff sign-in is turned off for this app.',
  INVALID_CALLBACK_URL: 'This page is not on an address the server trusts.',
}

/** Why a staff sign-in did not go through, from the code it came back with or an `AuthError` of its start. */
export const staffSignInMessage = (failure: string | AuthError) => {
  const code = typeof failure === 'string' ? failure : failure.code
  if (code && staffMessages[code]) return staffMessages[code]
  if (typeof failure === 'string') return 'The staff sign-in did not go through. Try again.'
  return failure.status === 429 ? tooManyRequests : failure.message
}
