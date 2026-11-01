import type { AuthContext } from './organizations/store'

type Internal = Pick<AuthContext['internalAdapter'], 'createVerificationValue' | 'deleteVerificationByIdentifier' | 'findVerificationValue'>

/**
 * A time noted per session under `name`, such as when it last proved a passkey. Kept in Better Auth's verification
 * table, which every store has, so recording one needs no migration; a note ends with its session.
 */
export const sessionNote = (name: string) => {
  const identifierOf = (sessionId: string) => `protobase-${name}-${sessionId}`
  return {
    save: async (internal: Internal, session: { id: string; expiresAt: Date }, now = new Date()) => {
      const identifier = identifierOf(session.id)
      await internal.deleteVerificationByIdentifier(identifier)
      await internal.createVerificationValue({ identifier, value: now.toISOString(), expiresAt: session.expiresAt })
    },
    /** When the note was saved, if it was and has not expired. */
    at: async (internal: Internal, sessionId: string, now = new Date()) => {
      const found = await internal.findVerificationValue(identifierOf(sessionId))
      if (!found || new Date(found.expiresAt) <= now) return
      return new Date(found.value)
    },
  }
}

/** Whether `at` lies within the last `minutes`. */
export const isWithin = (at: Date | undefined, minutes: number, now = new Date()) => at !== undefined && now.getTime() - at.getTime() <= minutes * 60_000
