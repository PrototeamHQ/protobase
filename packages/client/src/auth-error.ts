/** A failed sign-in or account change, with Better Auth's status and code (for example `INVALID_EMAIL_OR_PASSWORD`). */
export class AuthError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(message)
    this.name = 'AuthError'
  }
}

type BetterAuthError = { message?: string; status?: number; code?: string } | null | undefined

/** Better Auth's error from a client call as an `AuthError`, with `fallback` when it has no message. */
export const authError = (error: BetterAuthError, fallback: string) => new AuthError(error?.message || fallback, error?.status ?? 500, error?.code)
