import type { AuthError } from '@protobase/client'
import { defineMessages } from '../locale/messages'

const text = defineMessages({
  en: {
    tooManyRequests: 'Too many attempts. Wait a minute and try again.',
    passkeyClosed: 'The passkey prompt closed before it finished. Try again.',
    wrongEmailOrPassword: 'The email or password is not right.',
    wrongPassword: 'The password is not right.',
    wrongCode: 'The code is not right.',
    codeExpired: 'The code has expired. Ask for a new one.',
    tooManyCodes: 'Too many wrong codes. Ask for a new one.',
    wrongBackupCode: 'The backup code is not right, or was used before.',
    tooManyCodesSignIn: 'Too many wrong codes. Sign in again.',
    locked: 'Too many wrong codes. Wait 15 minutes and try again.',
    tooSlow: 'This sign-in took too long. Sign in again.',
    passkeyNotFound: 'This passkey is not registered for an account here.',
    passkeyFailed: 'The passkey could not be checked. Try again.',
    passkeyAdded: 'This passkey is added already.',
    notFresh: 'For this change, sign out and sign in again first.',
    staffPermissionMissing: 'Your staff account has no permission to sign in as people here.',
    staffNotStrong: 'Sign in to your staff account with a passkey or a second step, then try again.',
    staffStale: 'Your staff sign-in is too old. Sign in to your staff account again.',
    staffExpired: 'This staff sign-in took too long or was used already. Start again.',
    staffProviderFailed: 'The staff sign-in did not go through at the provider. Try again.',
    staffUserUnavailable: 'There is no account with this address, or it is disabled.',
    staffReasonRequired: 'Say why you sign in as this person, in at least 10 characters.',
    staffForbidden: 'Staff sign-in is turned off for this app.',
    untrustedCallback: 'This page is not on an address the server trusts.',
    staffFailed: 'The staff sign-in did not go through. Try again.',
  },
  nl: {
    tooManyRequests: 'Te veel pogingen. Wacht een minuut en probeer het opnieuw.',
    passkeyClosed: 'De passkey-vraag sloot voordat die klaar was. Probeer het opnieuw.',
    wrongEmailOrPassword: 'Het e-mailadres of wachtwoord klopt niet.',
    wrongPassword: 'Het wachtwoord klopt niet.',
    wrongCode: 'De code klopt niet.',
    codeExpired: 'De code is verlopen. Vraag een nieuwe aan.',
    tooManyCodes: 'Te veel verkeerde codes. Vraag een nieuwe aan.',
    wrongBackupCode: 'De back-upcode klopt niet, of is al eerder gebruikt.',
    tooManyCodesSignIn: 'Te veel verkeerde codes. Log opnieuw in.',
    locked: 'Te veel verkeerde codes. Wacht 15 minuten en probeer het opnieuw.',
    tooSlow: 'Deze inlogpoging duurde te lang. Log opnieuw in.',
    passkeyNotFound: 'Deze passkey hoort hier bij geen enkel account.',
    passkeyFailed: 'De passkey kon niet worden gecontroleerd. Probeer het opnieuw.',
    passkeyAdded: 'Deze passkey is al toegevoegd.',
    notFresh: 'Log voor deze wijziging eerst uit en opnieuw in.',
    staffPermissionMissing: 'Je medewerkersaccount mag hier niet als iemand anders inloggen.',
    staffNotStrong: 'Log in op je medewerkersaccount met een passkey of een tweede stap, en probeer het dan opnieuw.',
    staffStale: 'Je inlog als medewerker is te oud. Log opnieuw in op je medewerkersaccount.',
    staffExpired: 'Deze inlog als medewerker duurde te lang of is al gebruikt. Begin opnieuw.',
    staffProviderFailed: 'De inlog als medewerker lukte niet bij de provider. Probeer het opnieuw.',
    staffUserUnavailable: 'Er is geen account met dit adres, of het is uitgeschakeld.',
    staffReasonRequired: 'Zeg in minstens 10 tekens waarom je als deze persoon inlogt.',
    staffForbidden: 'Inloggen als medewerker staat uit voor deze app.',
    untrustedCallback: 'Deze pagina staat niet op een adres dat de server vertrouwt.',
    staffFailed: 'De inlog als medewerker lukte niet. Probeer het opnieuw.',
  },
})

type Id = Parameters<typeof text>[0]

// Why a provider sent the browser back, with the provider's name.
const providerText = defineMessages({
  en: {
    signupDisabled: (name: string) => `No account here belongs to this ${name} account. Ask an admin to add you, or sign in another way.`,
    notLinked: (name: string) => `Your ${name} account is not linked to your account here. Sign in another way, then connect ${name} on the Sign-in & security page.`,
    linkedToOther: (name: string) => `This ${name} account is linked to someone else here already.`,
    couldNotLink: (name: string) => `Your ${name} account could not be linked. Try again.`,
    accessDenied: (name: string) => `${name} did not let you in, or you cancelled.`,
    domainNotAllowed: (name: string) => `${name} signed you in with an address this app does not accept from it. Sign in another way.`,
    providerFailed: (name: string) => `Signing in with ${name} did not go through. Try again.`,
  },
  nl: {
    signupDisabled: (name: string) => `Geen account hier hoort bij dit ${name}-account. Vraag een beheerder om je toe te voegen, of log op een andere manier in.`,
    notLinked: (name: string) => `Je ${name}-account is niet gekoppeld aan je account hier. Log op een andere manier in en koppel ${name} dan op de pagina Inloggen en beveiliging.`,
    linkedToOther: (name: string) => `Dit ${name}-account is hier al aan iemand anders gekoppeld.`,
    couldNotLink: (name: string) => `Je ${name}-account kon niet worden gekoppeld. Probeer het opnieuw.`,
    accessDenied: (name: string) => `${name} liet je niet binnen, of je hebt geannuleerd.`,
    domainNotAllowed: (name: string) => `${name} logde je in met een adres dat deze app daarvan niet accepteert. Log op een andere manier in.`,
    providerFailed: (name: string) => `Inloggen met ${name} lukte niet. Probeer het opnieuw.`,
  },
})

// Better Auth's codes for the person at the keyboard; anything else shows the server's own message.
const messages: Record<string, Id> = {
  INVALID_EMAIL_OR_PASSWORD: 'wrongEmailOrPassword',
  INVALID_PASSWORD: 'wrongPassword',
  INVALID_OTP: 'wrongCode',
  OTP_EXPIRED: 'codeExpired',
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
  signup_disabled: (name) => providerText('signupDisabled', name),
  account_not_linked: (name) => providerText('notLinked', name),
  account_already_linked_to_different_user: (name) => providerText('linkedToOther', name),
  unable_to_link_account: (name) => providerText('couldNotLink', name),
  access_denied: (name) => providerText('accessDenied', name),
  // A SAML identity provider's, for an address outside its domains: the server's own code, as it sends it.
  EMAIL_DOMAIN_NOT_ALLOWED: (name) => providerText('domainNotAllowed', name),
}

/** Why signing in or linking with the provider `name` did not go through, from the code it came back with. */
export const providerMessage = (code: string, name: string) => providerMessages[code]?.(name) ?? providerText('providerFailed', name)
