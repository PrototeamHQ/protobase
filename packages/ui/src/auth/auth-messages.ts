import type { AuthError } from '@protobase/client'
import { messages as catalogue } from '../locale/messages'

const text = catalogue('auth/errors')

type Id = Parameters<typeof text>[0]

// Better Auth's codes for the person at the keyboard; anything else shows the server's own message.
const messages: Record<string, Id> = {
  INVALID_EMAIL_OR_PASSWORD: 'wrongEmailOrPassword',
  INVALID_PASSWORD: 'wrongPassword',
  // Better Auth drops an expired emailed code before it checks one, so a late code is mostly this and seldom OTP_EXPIRED.
  INVALID_OTP: 'wrongOrExpiredCode',
  OTP_EXPIRED: 'codeExpired',
  OTP_HAS_EXPIRED: 'codeExpired',
  TOO_MANY_ATTEMPTS: 'tooManyCodes',
  INVALID_CODE: 'wrongCode',
  INVALID_BACKUP_CODE: 'wrongBackupCode',
  TOO_MANY_ATTEMPTS_REQUEST_NEW_CODE: 'tooManyCodesSignIn',
  ACCOUNT_TEMPORARILY_LOCKED: 'locked',
  INVALID_TWO_FACTOR_COOKIE: 'tooSlow',
  AUTH_CANCELLED: 'passkeyClosed',
  ERROR_CEREMONY_ABORTED: 'passkeyClosed',
  REGISTRATION_CANCELLED: 'passkeyClosed',
  PASSKEY_NOT_FOUND: 'passkeyNotFound',
  AUTHENTICATION_FAILED: 'passkeyFailed',
  PREVIOUSLY_REGISTERED: 'passkeyAdded',
  ERROR_AUTHENTICATOR_PREVIOUSLY_REGISTERED: 'passkeyAdded',
  SESSION_NOT_FRESH: 'notFresh',
  // Better Auth's answer to an account deletion without a password from a session older than a day.
  SESSION_EXPIRED: 'notFresh',
  PASSWORD_COMPROMISED: 'passwordLeaked',
}

const lookup = (ids: Record<string, Id>, code: string | undefined) => {
  const id = code ? ids[code] : undefined
  return id && (text(id))
}

const known = (error: AuthError) => lookup(messages, error.code)

/** Better Auth's error from a sign-in step or an account change, in words for the person at the keyboard. */
export const authMessage = (error: AuthError) => known(error) ?? (error.status === 429 ? text('tooManyRequests') : error.message)

/** As `authMessage`, for the password form: any other 401 is a wrong email or password. */
export const signInMessage = (error: AuthError) => known(error) ?? (error.status === 429 ? text('tooManyRequests') : error.status === 401 ? text('wrongEmailOrPassword') : error.message)

// Why a staff sign-in did not go through, by the code the server's staff callback or start answers with.
const staffMessages: Record<string, Id> = {
  STAFF_PERMISSION_MISSING: 'staffPermissionMissing',
  STAFF_SIGN_IN_NOT_STRONG: 'staffNotStrong',
  STAFF_SIGN_IN_STALE: 'staffStale',
  STAFF_SIGN_IN_EXPIRED: 'staffExpired',
  STAFF_SIGN_IN_FAILED: 'staffProviderFailed',
  STAFF_USER_UNAVAILABLE: 'staffUserUnavailable',
  STAFF_REASON_REQUIRED: 'staffReasonRequired',
  SIGN_IN_METHOD_FORBIDDEN: 'staffForbidden',
  INVALID_CALLBACK_URL: 'untrustedCallback',
}

/** Why a staff sign-in did not go through, from the code it came back with or an `AuthError` of its start. */
export const staffSignInMessage = (failure: string | AuthError) => {
  const message = lookup(staffMessages, typeof failure === 'string' ? failure : failure.code)
  if (message) return message
  if (typeof failure === 'string') return text('staffFailed')
  return failure.status === 429 ? text('tooManyRequests') : failure.message
}

// Why a provider sent the browser back without signing in or linking, by the code Better Auth puts in `?error=`.
const providerMessages: Record<string, (name: string) => string> = {
  signup_disabled: (name) => text('signupDisabled', { name }),
  account_not_linked: (name) => text('notLinked', { name }),
  account_already_linked_to_different_user: (name) => text('linkedToOther', { name }),
  unable_to_link_account: (name) => text('couldNotLink', { name }),
  access_denied: (name) => text('accessDenied', { name }),
  // A SAML identity provider's, for an address outside its domains: the server's own code, as it sends it.
  EMAIL_DOMAIN_NOT_ALLOWED: (name) => text('domainNotAllowed', { name }),
}

/** Why signing in or linking with the provider `name` did not go through, from the code it came back with. */
export const providerMessage = (code: string, name: string) => providerMessages[code]?.(name) ?? text('providerFailed', { name })
