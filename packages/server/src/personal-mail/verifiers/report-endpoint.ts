import { APIError, createAuthEndpoint } from 'better-auth/api'
import * as z from 'zod'
import { settledOutcome, validOutcome } from './verification-outcome'
import type { SenderVerifications } from './sender-verifications'

/** Where a verifier's outside service settles a verification, under the auth base path. */
export const reportVerificationPath = '/mail-sender-verifications/report'

/**
 * The one answer to every report that settles nothing: a missing or wrong secret, another verifier's, one that settled
 * or expired. It says nothing of whether the verification exists or what it is.
 */
export const reportRefused = { code: 'VERIFICATION_REFUSED', message: 'This report is not accepted.' }

const invalid = { code: 'INVALID_VERIFICATION_OUTCOME', message: 'The outcome is not valid.' }

// The secret is optional here so that a report without one is refused as one with a wrong one is, not as malformed.
const body = settledOutcome.and(z.object({ verifier: z.string().max(64), secret: z.string().max(256).optional() }))

/**
 * `POST /api/auth/mail-sender-verifications/report { verifier, secret, state, valid_until | error_code, error? }`:
 * settles the pending verification whose secret the JSON body gives, as `verifier`, the one that started it, reports.
 * No session is needed or used: the secret alone admits it, read from the body only. A malformed outcome answers 400
 * before anything is looked up; every other report that settles nothing answers the same 403 (`reportRefused`).
 */
export const reportEndpoint = (verifications: SenderVerifications) =>
  createAuthEndpoint(reportVerificationPath, { method: 'POST', body }, async (ctx) => {
    const { verifier, secret, ...given } = ctx.body
    const outcome = validOutcome(given, new Date(), false)
    if (!outcome || outcome.state === 'pending') throw new APIError('BAD_REQUEST', invalid)
    if (!(await verifications.report(verifier, secret, outcome))) throw new APIError('FORBIDDEN', reportRefused)
    return ctx.json({ settled: true })
  })
