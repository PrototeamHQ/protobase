// When the user's address was confirmed, kept beside Better Auth's `emailVerified`, which says only whether it was:
// clients that call the app the way they call Supabase read it as `email_confirmed_at`. Nothing guesses it: an account
// verified before the column existed keeps it empty, and an imported one keeps the time its own system recorded.

/** The user field that holds the time, in the `email_confirmed_at` column unless the app names it otherwise. */
export const emailConfirmedField = { emailConfirmedAt: { type: 'date', required: false, input: false, fieldName: 'email_confirmed_at' } } as const

type UserWrite = { emailVerified?: unknown; email?: unknown; emailConfirmedAt?: unknown }

/** A new user, confirmed now when created verified. A time the data gives itself, such as an import's, is kept. */
export const confirmedOnCreate = <T extends UserWrite>(user: T, now: Date): T =>
  user.emailConfirmedAt === undefined && user.emailVerified === true ? { ...user, emailConfirmedAt: now } : user

/**
 * An update, with the confirmation time it implies: now, when it verifies the address, which Better Auth does only for
 * one not verified yet; empty, when it changes the address without verifying it. A time the update gives is kept.
 */
export const confirmedOnUpdate = <T extends UserWrite>(data: T, now: Date): T => {
  if (data.emailConfirmedAt !== undefined) return data
  if (data.emailVerified === true) return { ...data, emailConfirmedAt: now }
  if (data.email !== undefined) return { ...data, emailConfirmedAt: null }
  return data
}
