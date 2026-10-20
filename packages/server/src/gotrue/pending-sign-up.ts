import type { AuthContext } from '../better-auth/organizations/store'

// What someone signing up gives before their address is proved, kept until the code mailed to it comes back: in Better
// Auth's verification table, beside the code, for an hour. The account is made only with the right code, so nobody
// holds an address its owner does not read.

export type PendingSignUp = {
  /** The password, hashed as Better Auth hashes it; none for a sign-up by emailed code. */
  passwordHash?: string
  metadata: Record<string, unknown>
}

const pendingSeconds = 60 * 60

const identifierOf = (email: string) => `gotrue-sign-up-${email}`

/** Keeps what `email` signs up with, replacing what an earlier sign-up with it gave. */
export const savePendingSignUp = async (context: AuthContext, email: string, pending: PendingSignUp) => {
  const identifier = identifierOf(email)
  await context.internalAdapter.deleteVerificationByIdentifier(identifier)
  await context.internalAdapter.createVerificationValue({ identifier, value: JSON.stringify(pending), expiresAt: new Date(Date.now() + pendingSeconds * 1000) })
}

/** Whether a sign-up with `email` waits for its code. */
export const hasPendingSignUp = async (context: AuthContext, email: string) => {
  const found = await context.internalAdapter.findVerificationValue(identifierOf(email))
  return found !== null && new Date(found.expiresAt) > new Date()
}

/** Takes what `email` signed up with, so it is used once; `undefined` when nothing waits, or it waited too long. */
export const takePendingSignUp = async (context: AuthContext, email: string): Promise<PendingSignUp | undefined> => {
  const consumed = await context.internalAdapter.consumeVerificationValue(identifierOf(email))
  if (!consumed || new Date(consumed.expiresAt) < new Date()) return undefined
  return JSON.parse(consumed.value) as PendingSignUp
}
