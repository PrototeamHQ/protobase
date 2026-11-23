import type { Locale } from '@protobase/schema/internal'
import type { PersonalMail } from '../personal-mailer'
import type { SenderAddressVerifier, VerificationOutcome } from './sender-address-verifier'
import { startVerification, type VerifiedSender } from './start-verification'
import { secretHash } from './verification-secret'
import type { VerificationStore } from './verification-store'
import { verificationSweepJob } from './verification-sweep'

/**
 * The app's verifiers at work: `start` runs each on an address of `userId`'s through their own mailbox; `report`
 * settles the verification whose secret it gives, only for the verifier that started it, answering whether it did;
 * `latestOf` and `proofsOf` read what they found; `jobs` holds the sweep.
 */
export const senderVerifications = (verifiers: readonly SenderAddressVerifier[], store: VerificationStore, mailOf: (userId: string) => PersonalMail) => {
  const ids = verifiers.map(({ id }) => id)
  return {
    ids,
    start: async (userId: string, sender: VerifiedSender, locale: Locale) => {
      const mail = mailOf(userId)
      for (const verifier of verifiers) await startVerification(verifier, store, mail, sender, locale)
    },
    report: async (verifier: string, secret: string | undefined, outcome: Exclude<VerificationOutcome, { state: 'pending' }>) => {
      if (!secret || !ids.includes(verifier)) return false
      return store.settle({ secretHash: await secretHash(secret) }, verifier, outcome)
    },
    latestOf: (userId: string) => store.latestOf(userId, ids),
    proofsOf: (userId: string) => store.proofsOf(userId, ids),
    jobs: [verificationSweepJob(verifiers, store)],
  }
}

export type SenderVerifications = ReturnType<typeof senderVerifications>
