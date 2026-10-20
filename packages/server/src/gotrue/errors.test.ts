import { APIError } from 'better-auth/api'
import { describe, expect, it } from 'vitest'
import { asGoTrueError, errorBody, fromBetterAuth, GoTrueError } from './errors'

describe("Better Auth's refusals as GoTrue's", () => {
  it('words the ones supabase-js and apps check for as GoTrue does', () => {
    expect(errorBody(fromBetterAuth(401, { code: 'INVALID_EMAIL_OR_PASSWORD', message: 'Invalid email or password' }))).toEqual({ code: 400, error_code: 'invalid_credentials', msg: 'Invalid login credentials' })
    expect(errorBody(fromBetterAuth(400, { code: 'INVALID_OTP', message: 'Invalid OTP' }))).toEqual({ code: 403, error_code: 'otp_expired', msg: 'Token has expired or is invalid' })
    expect(errorBody(fromBetterAuth(403, { code: 'BANNED_USER', message: 'You have been banned from this application' }))).toEqual({ code: 403, error_code: 'user_banned', msg: 'You have been banned from this application' })
    expect(fromBetterAuth(429, { message: 'Too many requests. Please try again later.' }).errorCode).toBe('over_request_rate_limit')
  })

  it('keeps the status of any other, with its code in lower case', () => {
    expect(errorBody(fromBetterAuth(403, { code: 'SIGN_IN_SETUP_REQUIRED', message: 'Set up what this app requires for signing in first.' }))).toEqual({ code: 403, error_code: 'sign_in_setup_required', msg: 'Set up what this app requires for signing in first.' })
    expect(fromBetterAuth(500, undefined)).toMatchObject({ status: 500, errorCode: 'unexpected_failure' })
  })

  it("turns Better Auth's thrown errors only", () => {
    expect(asGoTrueError(new APIError('BAD_REQUEST', { code: 'REFRESH_TOKEN_NOT_FOUND', message: 'Invalid Refresh Token: Refresh Token Not Found' }))).toEqual(new GoTrueError(400, 'refresh_token_not_found', 'Invalid Refresh Token: Refresh Token Not Found'))
    const other = new Error('database down')
    expect(asGoTrueError(other)).toBe(other)
  })
})
