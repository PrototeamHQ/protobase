import { createHash, timingSafeEqual } from 'node:crypto'
import { generateRandomString } from 'better-auth/crypto'
import { emailCodeMinutes } from '@protobase/schema/internal'
import type { AuthContext } from './organizations/store'

/** Wrong codes a confirmation code takes before it stops working, and a new one has to be asked for. */
export const confirmationCodeTries = 3

type Internal = Pick<AuthContext['internalAdapter'], 'createVerificationValue' | 'deleteVerificationByIdentifier' | 'findVerificationValue'>

/** Whose code it is: the signed-in user and the session that asked for it. */
export type CodeHolder = { userId: string; sessionId: string }

type Stored = { userId: string; hash: string; wrong: number }

// Kept in Better Auth's verification table under a name of its own, apart from the email OTP plugin's sign-in codes
// (`sign-in-otp-<email>`), which never read it, and stored hashed.
const identifierOf = (sessionId: string) => `protobase-confirmation-code-${sessionId}`

const hashOf = (code: string) => createHash('sha256').update(code).digest('hex')

const sameHash = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b))

/** Ends the session's confirmation code, if it has one, so only a newer one works. */
export const dropConfirmationCode = (internal: Internal, sessionId: string) => internal.deleteVerificationByIdentifier(identifierOf(sessionId))

/** A new six-digit code, as the email shows it. */
export const newConfirmationCode = () => generateRandomString(6, '0-9')

/** Keeps `code` as the session's confirmation code for `emailCodeMinutes`, in place of any earlier one. */
export const saveConfirmationCode = async (internal: Internal, holder: CodeHolder, code: string, now = new Date()) => {
  const identifier = identifierOf(holder.sessionId)
  await internal.deleteVerificationByIdentifier(identifier)
  const value: Stored = { userId: holder.userId, hash: hashOf(code), wrong: 0 }
  await internal.createVerificationValue({ identifier, value: JSON.stringify(value), expiresAt: new Date(now.getTime() + emailCodeMinutes * 60_000) })
}

export type CodeCheck = 'confirmed' | 'wrong' | 'too-many' | 'expired'

/**
 * Checks `code` against the session's confirmation code: a code of another session or user is none. A right code is
 * used up; a wrong one counts, and the code stops working at `confirmationCodeTries` wrong ones.
 */
export const checkConfirmationCode = async (internal: Internal, holder: CodeHolder, code: string, now = new Date()): Promise<CodeCheck> => {
  const identifier = identifierOf(holder.sessionId)
  const found = await internal.findVerificationValue(identifier)
  if (!found || new Date(found.expiresAt) <= now) return 'expired'
  const stored = JSON.parse(found.value) as Stored
  if (stored.userId !== holder.userId) return 'expired'
  if (sameHash(stored.hash, hashOf(code))) {
    await internal.deleteVerificationByIdentifier(identifier)
    return 'confirmed'
  }
  await internal.deleteVerificationByIdentifier(identifier)
  const wrong = stored.wrong + 1
  if (wrong >= confirmationCodeTries) return 'too-many'
  await internal.createVerificationValue({ identifier, value: JSON.stringify({ ...stored, wrong }), expiresAt: new Date(found.expiresAt) })
  return 'wrong'
}
