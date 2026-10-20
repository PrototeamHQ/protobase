import { APIError } from 'better-auth/api'

/** A refusal as GoTrue words it: an HTTP status, one of its error codes, and a message for people. */
export class GoTrueError extends Error {
  constructor(
    readonly status: number,
    readonly errorCode: string,
    message: string,
  ) {
    super(message)
  }
}

/** The JSON GoTrue answers a refusal with; supabase-js reads `error_code` and `msg` from it. */
export const errorBody = (error: GoTrueError) => ({ code: error.status, error_code: error.errorCode, msg: error.message })

const invalidCode = [403, 'otp_expired', 'Token has expired or is invalid'] as const

// Better Auth's codes, and Protobase's own, whose GoTrue counterparts supabase-js or apps check for.
const known: Record<string, readonly [number, string, string?]> = {
  INVALID_EMAIL_OR_PASSWORD: [400, 'invalid_credentials', 'Invalid login credentials'],
  INVALID_OTP: invalidCode,
  OTP_EXPIRED: invalidCode,
  TOO_MANY_ATTEMPTS: invalidCode,
  SIGN_UP_CODE_INVALID: invalidCode,
  SIGN_UP_TICKET_INVALID: invalidCode,
  BANNED_USER: [403, 'user_banned'],
  NO_ADMIN_YET: [422, 'signup_disabled'],
  PASSWORD_LENGTH: [422, 'weak_password'],
  PASSWORD_REQUIRED: [422, 'weak_password'],
}

/** A refusal of Better Auth, by its status and body, as GoTrue's: a known code becomes GoTrue's, any other its own in lower case. */
export const fromBetterAuth = (status: number, body: { code?: unknown; message?: unknown } | undefined) => {
  const code = typeof body?.code === 'string' ? body.code : undefined
  const message = typeof body?.message === 'string' ? body.message : 'The request was refused'
  if (status === 429) return new GoTrueError(429, 'over_request_rate_limit', message)
  const mapped = code === undefined ? undefined : known[code]
  if (mapped) return new GoTrueError(mapped[0], mapped[1], mapped[2] ?? message)
  return new GoTrueError(status, code?.toLowerCase() ?? (status >= 500 ? 'unexpected_failure' : 'bad_request'), message)
}

/** A Better Auth `APIError` as GoTrue's refusal; any other error as it is. */
export const asGoTrueError = (error: unknown) => (error instanceof APIError ? fromBetterAuth(error.statusCode, error.body) : error)
