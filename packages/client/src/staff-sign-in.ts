import { authError } from './auth-error'
import type { BetterAuthClient } from './better-auth-client'

/** A staff sign-in as someone: who, as whom (`user`), why, and when it started and ends (or ended). */
export type StaffSignIn = { id: string; user: string; staff: string; staffName?: string; reason: string; startedAt: string; expiresAt: string; endedAt?: string }

type Received = Omit<StaffSignIn, 'startedAt' | 'expiresAt' | 'endedAt'> & { startedAt: string | Date; expiresAt: string | Date; endedAt?: string | Date }

const iso = (value: string | Date) => new Date(value).toISOString()

// Better Auth's client reads ISO dates in answers as `Date`s; the entries keep them as text, as the server sends them.
const entry = ({ startedAt, expiresAt, endedAt, ...rest }: Received): StaffSignIn => ({ ...rest, startedAt: iso(startedAt), expiresAt: iso(expiresAt), ...(endedAt && { endedAt: iso(endedAt) }) })

/**
 * Staff of the operator signing in as a person, for support. `start` answers the operator provider's URL, which sends
 * the browser back to `callbackURL` signed in as the person, or with `?staff-error=<code>`. Each call rejects with `AuthError`.
 */
export const staffSignInClient = (client: BetterAuthClient) => ({
  start: async (input: { email: string; reason: string; callbackURL: string }) => {
    const { data, error } = await client.$fetch<{ url: string }>('/staff/sign-in', { method: 'POST', body: input })
    if (error || !data?.url) throw authError(error, 'Could not start the staff sign-in')
    return data.url
  },

  /** The staff sign-in behind this session, or `undefined` when the person signed in themselves. */
  current: async () => {
    const { data, error } = await client.$fetch<{ staff: Received | null }>('/staff/session')
    if (error || !data) throw authError(error, 'Could not read the session')
    return data.staff ? entry(data.staff) : undefined
  },

  /** Ends the staff session; the browser is signed out. */
  stop: async () => {
    const { error } = await client.$fetch('/staff/stop', { method: 'POST', body: {} })
    if (error) throw authError(error, 'Could not end the staff session')
  },

  /** For admins: the log of staff sign-ins, newest first. */
  log: async () => {
    const { data, error } = await client.$fetch<{ signIns: Received[] }>('/staff/sign-ins')
    if (error || !data) throw authError(error, 'Could not read the staff sign-ins')
    return data.signIns.map(entry)
  },
})

export type StaffSignInClient = ReturnType<typeof staffSignInClient>
