import type { Locale } from '@protobase/schema/internal'

/** The From address a verification proves, as a verifier reads it. */
export type VerificationInput = {
  /** The verification's own record id: readable, never a credential. */
  verification_id: string
  address: string
  name?: string
}

/**
 * What `verify` is given besides the address: `secret`, at least 128 random bits minted for this verification alone,
 * the only credential that settles it through `POST /api/auth/mail-sender-verifications/report`. The app keeps only its
 * hash, so it is never handed out again. `locale`: the language of the person who asked, for the test message.
 */
export type VerifyInput = VerificationInput & { secret: string; locale: Locale }

/** A test message: always one recipient, sent through the address's own mailbox, From that address. */
export type VerificationMessage = { to: string; subject: string; text: string; html?: string }

export type VerifyTools = {
  /** Sends one test message; a second send in the same `verify` is refused. */
  send: (message: VerificationMessage) => Promise<void>
}

/**
 * Where a verification stands after `verify` or `check`: `pending` until `expires_at` (required from `verify`, which the
 * app caps at 24 hours after the verification started; `check` cannot move it), checked again at `check_after`, a
 * minute on at the soonest (default a minute on); `verified` until `valid_until` (required, capped at 28 days); `failed` with an `error_code`
 * such as `from_rewritten`, and an optional `error` text of at most 500 characters, shown as plain text.
 */
export type VerificationOutcome =
  | { state: 'pending'; expires_at?: Date; check_after?: Date }
  | { state: 'verified'; valid_until: Date }
  | { state: 'failed'; error_code: string; error?: string }

/**
 * A way to prove that mail from a From address goes out from it, which the app's own trusted code plugs in with
 * `add_verifier`, such as a hosting platform's test-mail check. `id` is stored on each verification, so it stays the
 * same across releases. `verify` starts one, and may send a single test message with `tools.send`; `check`, when given,
 * is called by the app's sweep each minute a verification is due, until it settles or expires. A verification can also
 * be settled from outside with its secret (see `VerifyInput`).
 */
export type SenderAddressVerifier = {
  id: string
  verify: (input: VerifyInput, tools: VerifyTools) => Promise<VerificationOutcome>
  check?: (input: VerificationInput) => Promise<VerificationOutcome>
}

/** Registers a verifier: from the project's `auth/hooks.ts` `senderVerifiers`, or the host's runtime. */
export type AddVerifier = (verifier: SenderAddressVerifier) => void
