import { describe, expect, it } from 'vitest'
import { AuthError } from '@protobase/client'
import { authMessage, providerMessage, signInMessage, staffSignInMessage } from './auth-messages'

describe('auth messages', () => {
  it('words the codes of the sign-in steps, and keeps the server message for anything else', () => {
    expect(authMessage(new AuthError('Invalid code', 401, 'INVALID_CODE'))).toBe('The code is not right.')
    expect(authMessage(new AuthError('Too many failed verification attempts.', 429, 'ACCOUNT_TEMPORARILY_LOCKED'))).toBe('Too many wrong codes. Wait 15 minutes and try again.')
    expect(authMessage(new AuthError('Too many requests', 429))).toBe('Too many attempts. Wait a minute and try again.')
    expect(authMessage(new AuthError('Signing in with a password is turned off.', 403, 'SIGN_IN_METHOD_FORBIDDEN'))).toBe('Signing in with a password is turned off.')
  })

  it('reads any other 401 of the password form as a wrong email or password', () => {
    expect(signInMessage(new AuthError('Unauthorized', 401))).toBe('The email or password is not right.')
    expect(signInMessage(new AuthError('Signing in with a password is turned off.', 403, 'SIGN_IN_METHOD_FORBIDDEN'))).toBe('Signing in with a password is turned off.')
  })

  it('words why a staff sign-in did not go through, from the code it came back with or the error of its start', () => {
    expect(staffSignInMessage('STAFF_SIGN_IN_NOT_STRONG')).toBe('Sign in to your staff account with a passkey or a second step, then try again.')
    expect(staffSignInMessage('SIGN_IN_METHOD_FORBIDDEN')).toBe('Staff sign-in is turned off for this app.')
    expect(staffSignInMessage('SOMETHING_NEW')).toBe('The staff sign-in did not go through. Try again.')
    expect(staffSignInMessage(new AuthError('Staff sign-in is turned off for this app.', 403, 'SIGN_IN_METHOD_FORBIDDEN'))).toBe('Staff sign-in is turned off for this app.')
    expect(staffSignInMessage(new AuthError('Too many requests', 429))).toBe('Too many attempts. Wait a minute and try again.')
  })

  it("words why a provider sent the browser back, by its code, with the provider's name", () => {
    expect(providerMessage('signup_disabled', 'GitHub')).toBe('No account here belongs to this GitHub account. Ask an admin to add you, or sign in another way.')
    expect(providerMessage('account_already_linked_to_different_user', 'GitHub')).toBe('This GitHub account is linked to someone else here already.')
    expect(providerMessage('invalid_code', 'Acme SSO')).toBe('Signing in with Acme SSO did not go through. Try again.')
  })
})
