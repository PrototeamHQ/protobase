import { authError } from './auth-error'
import type { BetterAuthClient } from './better-auth-client'

/**
 * A browser or app signed in to the account: its session token (to sign it out), whether it is this one, its user agent
 * and IP address when known, when it signed in, was last active and expires, and the staff member's address for a
 * staff session.
 */
export type DeviceSession = {
  token: string
  current: boolean
  userAgent?: string
  ipAddress?: string
  createdAt: string
  updatedAt: string
  expiresAt: string
  staff?: string
}

const isoDate = (value: string | Date) => new Date(value).toISOString()

/** The signed-in person's name, password and signed-in devices. Each call rejects with `AuthError`. */
export const accountProfile = (client: BetterAuthClient) => ({
  updateName: async (name: string) => {
    const { error } = await client.updateUser({ name })
    if (error) throw authError(error, 'Could not change your name')
  },

  /** Changes the password, which the account must have; `signOutOthers` signs out every other device, this one stays signed in. */
  changePassword: async (current: string, next: string, signOutOthers: boolean) => {
    const { error } = await client.changePassword({ currentPassword: current, newPassword: next, revokeOtherSessions: signOutOthers })
    if (error) throw authError(error, 'Could not change your password')
  },

  /**
   * Gives an account without a password, such as one that signs in with emailed codes or GitHub, its first one; every
   * device stays signed in. One that has a password already is refused (`PASSWORD_ALREADY_SET`).
   */
  setPassword: async (next: string) => {
    const { error } = await client.$fetch('/account/set-password', { method: 'POST', body: { newPassword: next } })
    if (error) throw authError(error, 'Could not set your password')
  },

  /** The devices signed in now, with this one marked `current`. */
  sessions: async (): Promise<DeviceSession[]> => {
    const [list, own] = await Promise.all([client.listSessions(), client.getSession()])
    if (list.error || !list.data) throw authError(list.error, 'Could not read your devices')
    const currentToken = own.data?.session.token
    return list.data.map((session) => {
      const staff = (session as { impersonatedBy?: string | null }).impersonatedBy
      return {
        token: session.token,
        current: session.token === currentToken,
        ...(session.userAgent && { userAgent: session.userAgent }),
        ...(session.ipAddress && { ipAddress: session.ipAddress }),
        createdAt: isoDate(session.createdAt),
        updatedAt: isoDate(session.updatedAt),
        expiresAt: isoDate(session.expiresAt),
        ...(staff && { staff }),
      }
    })
  },

  /** Signs out one device, by its session token from `sessions`. */
  revokeSession: async (token: string) => {
    const { error } = await client.revokeSession({ token })
    if (error) throw authError(error, 'Could not sign out the device')
  },

  /** Signs out every device but this one. */
  revokeOtherSessions: async () => {
    const { error } = await client.revokeOtherSessions()
    if (error) throw authError(error, 'Could not sign out your other devices')
  },
})
