import { defineJob } from '../../jobs/define-job'
import type { SenderAddressVerifier } from './sender-address-verifier'
import { validOutcome, verifierError } from './verification-outcome'
import type { VerificationStore } from './verification-store'

/** How many due verifications the sweep claims at once. */
const batchSize = 100

/**
 * One pass of the sweep: fails every pending verification whose time ran out as `verification_expired`, then calls
 * `check` on each one due, claimed a batch at a time so a sweep beside it checks each once, and records its outcome.
 * A `check` that throws leaves its verification pending, to be checked again or expire; the throws are rethrown
 * together once every due verification had its turn.
 */
export const sweepVerifications = async (verifiers: readonly SenderAddressVerifier[], store: VerificationStore) => {
  await store.expireDue()
  const checking = new Map(verifiers.flatMap((verifier) => (verifier.check ? [[verifier.id, verifier.check] as const] : [])))
  if (checking.size === 0) return
  const errors: unknown[] = []
  for (;;) {
    const claimed = await store.claimDue([...checking.keys()], batchSize)
    for (const row of claimed) {
      const input = { verification_id: row.id, address: row.address, ...(row.name && { name: row.name }) }
      const outcome = await checking.get(row.verifier)!(input).then(
        (value) => ({ value }),
        (error: unknown) => void errors.push(error),
      )
      if (!outcome) continue
      await store.settle({ id: row.id }, row.verifier, validOutcome(outcome.value, new Date(), false) ?? { state: 'failed', error_code: verifierError })
    }
    if (claimed.length < batchSize) break
  }
  if (errors.length > 0) throw new AggregateError(errors, `${errors.length} From address verification checks failed`)
}

/** The sweep, each minute, on the app's jobs. */
export const verificationSweepJob = (verifiers: readonly SenderAddressVerifier[], store: VerificationStore) =>
  defineJob({ name: 'auth.mail-sender-verifications', schedule: '* * * * *', timeout: '5 minutes', maxAttempts: 1, run: async () => sweepVerifications(verifiers, store) })
