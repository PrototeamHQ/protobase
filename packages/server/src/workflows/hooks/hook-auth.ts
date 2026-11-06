import { verifySignature, verifyStandardWebhook, type SignatureOptions } from '../../functions/verify-signature'
import { HttpProblem } from '../../problem'
import { bearerMatches, usableSecret, type HookMode } from './hook-secrets'
import type { HookTarget } from './hook-store'

type HmacInput = Pick<SignatureOptions, 'header' | 'prefix' | 'encoding' | 'hash'>

/** The hmac options of a trigger's `auth`, and the header its signature comes in, which the run never sees. */
export const hmacOptions = (input: Record<string, unknown>) => (input.auth as Partial<HmacInput> | undefined) ?? {}

// A refused signature is a 401 problem from the verifiers; any other error is thrown on.
const verified = (check: Promise<unknown>) =>
  check.then(
    () => true,
    (error: unknown) => {
      if (error instanceof HttpProblem && error.status === 401) return false
      throw error
    },
  )

/**
 * Whether the call proves it comes from the sender, by the trigger's mode: a Standard Webhooks signature within five
 * minutes, an HMAC of the body in the configured header, or the bearer secret. A secret the mode cannot check with, as
 * after the mode changed since the URL was issued, proves nothing. `signed` holds the bytes already read.
 */
export const authenticated = async (signed: Request, mode: HookMode, hook: Pick<HookTarget, 'secret' | 'secret_hash' | 'input'>) => {
  if (mode === 'bearer') {
    const token = /^Bearer (.+)$/.exec(signed.headers.get('authorization') ?? '')?.[1]
    return token !== undefined && bearerMatches(token, hook.secret_hash)
  }
  if (!usableSecret(mode, hook.secret)) return false
  if (mode === 'standard_webhooks') return verified(verifyStandardWebhook(signed, { secret: hook.secret }))
  const { header, prefix, encoding, hash } = hmacOptions(hook.input)
  if (!header) return false
  return verified(verifySignature(signed, { secret: hook.secret, header, ...(prefix !== undefined && { prefix }), ...(encoding && { encoding }), ...(hash && { hash }) }))
}

/** The key a call starts its run once under: the signed `webhook-id`, or the configured idempotency header's value. */
export const idempotencyKey = (request: Request, mode: HookMode, input: Record<string, unknown>) => {
  if (mode === 'standard_webhooks') return request.headers.get('webhook-id') ?? undefined
  const header = input.idempotency_header
  return typeof header === 'string' ? (request.headers.get(header) ?? undefined) : undefined
}
