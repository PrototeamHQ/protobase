import * as z from 'zod'
import type { VerificationOutcome } from './sender-address-verifier'

/** The longest error text a verifier may give, in characters. */
export const maxErrorLength = 500

/** How long a verification may stay pending, from when it started. */
export const maxPendingMs = 24 * 60 * 60 * 1000

/** How long a verified outcome may count, from when it settled. */
export const maxValidMs = 90 * 24 * 60 * 60 * 1000

/** How long a started verification waits for `verify`'s first outcome before the next verify supersedes it. */
export const verifyLeaseMs = 5 * 60 * 1000

/** How long the sweep waits before checking a pending verification again, when its verifier names no time. */
export const checkIntervalMs = 60 * 1000

/** The codes the app settles a verification with itself: it ran out of time, or its verifier failed or answered nothing valid. */
export const verificationExpired = 'verification_expired'
export const verifierError = 'verifier_error'

// A Date from the verifier's code, or an ISO 8601 time with its offset from a report's JSON.
const time = z.union([z.date(), z.iso.datetime({ offset: true })]).transform((value) => new Date(value))

// Plain text: line breaks and tabs, no other control character, NUL included, which Postgres text cannot hold anyway.
const errorText = z
  .string()
  .max(maxErrorLength)
  .regex(/^[^\u0000-\u0008\u000b-\u001f\u007f]*$/)

const verified = z.object({ state: z.literal('verified'), valid_until: time })
const failed = z.object({ state: z.literal('failed'), error_code: z.string().regex(/^[a-z][a-z0-9_]{0,63}$/), error: errorText.optional() })
const pending = z.object({ state: z.literal('pending'), expires_at: time.optional(), check_after: time.optional() })

/** A settling outcome, as a report states it. */
export const settledOutcome = z.discriminatedUnion('state', [verified, failed])

const anyOutcome = z.discriminatedUnion('state', [pending, verified, failed])

/**
 * `value` as a valid outcome of `verify` (`first`, whose pending outcome must name `expires_at`) or `check`, or none.
 * A `valid_until` must lie after `now`. Longer error text is refused, never cut short.
 */
export const validOutcome = (value: unknown, now: Date, first: boolean): VerificationOutcome | undefined => {
  const parsed = anyOutcome.safeParse(value)
  if (!parsed.success) return
  const outcome = parsed.data
  if (outcome.state === 'pending' && first && !outcome.expires_at) return
  if (outcome.state === 'verified' && outcome.valid_until <= now) return
  return outcome
}
