import type { Locale } from '@protobase/schema/internal'
import type { PersonalMail } from '../personal-mailer'
import type { SenderAddressVerifier } from './sender-address-verifier'
import { validOutcome, verifierError } from './verification-outcome'
import { mintSecret, secretHash } from './verification-secret'
import type { VerificationStore } from './verification-store'
import { verifyTools } from './verify-tools'

/** The From address record a verification proves. */
export type VerifiedSender = { id: string; address: string; name: string | null }

const failedVerify = { state: 'failed', error_code: verifierError } as const

/**
 * Starts a verification of `sender` by `verifier`, unless one is pending already: a pending one whose time ran out,
 * as when its `verify` never returned, fails as expired first, so this one takes its place. The verification is
 * stored before `verify` runs, so two starts at once run one `verify`. Its outcome is recorded; an invalid one, or a
 * throw, fails the verification as `verifier_error`, and the throw goes on to the caller.
 */
export const startVerification = async (verifier: SenderAddressVerifier, store: VerificationStore, mail: PersonalMail, sender: VerifiedSender, locale: Locale) => {
  await store.expireOverdue(sender.id, verifier.id)
  const secret = mintSecret()
  const id = await store.start(sender.id, verifier.id, await secretHash(secret))
  if (!id) return
  const input = { verification_id: id, address: sender.address, ...(sender.name && { name: sender.name }), secret, locale }
  const outcome = await verifier.verify(input, verifyTools(mail, sender.id)).catch(async (error: unknown) => {
    await store.settle({ id }, verifier.id, failedVerify)
    throw error
  })
  await store.settle({ id }, verifier.id, validOutcome(outcome, new Date(), true) ?? failedVerify, true)
}
