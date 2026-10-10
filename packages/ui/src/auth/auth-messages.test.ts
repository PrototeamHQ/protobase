import { describe, expect, it } from 'vitest'
import { AuthError } from '@protobase/client'
import { authMessage, signInMessage } from './auth-messages'

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
})
