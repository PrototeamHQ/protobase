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

/**
 * A device signed in to the account by a platform sign-in provider whose accounts are devices: the id of its link (to
 * sign it out), the provider's id and name, the device's own name when its token gave one, when it was linked, and the
 * tokens of the sessions it began, which `sessions` also lists.
 */
export type DeviceLink = { id: string; provider: string; name: string; device?: string; linkedAt: string; sessions: string[] }

const isoDate = (value: string | Date) => new Date(value).toISOString()

/** The signed-in person's name, address, password and signed-in devices. Each call rejects with `AuthError`. */
export const accountProfile = (client: BetterAuthClient) => ({
  updateName: async (name: string) => {
    const { error } = await client.updateUser({ name })
    if (error) throw authError(error, 'Could not change your name')
  },

  /**
   * Changes the password, which the account must have: every other device is signed out, this one stays signed in,
   * and the account's address is emailed that its password changed.
   */
  changePassword: async (current: string, next: string) => {
    const { error } = await client.changePassword({ currentPassword: current, newPassword: next, revokeOtherSessions: true })
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

  /**
   * Mails a code to `newEmail` that moves the account to it, when the server has mail (`status().changeEmail`). The answer
   * is the same when another account has the address, which then gets no code.
   */
  requestEmailChange: async (newEmail: string) => {
    const { error } = await client.$fetch('/email-otp/request-email-change', { method: 'POST', body: { newEmail } })
    if (error) throw authError(error, 'Could not send the code')
  },

  /** Moves the account to `newEmail` with the code mailed there; this device stays signed in, with the new address. */
  changeEmail: async (newEmail: string, code: string) => {
    const { error } = await client.$fetch('/email-otp/change-email', { method: 'POST', body: { newEmail, otp: code } })
    if (error) throw authError(error, 'Could not change your address')
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

  /** The devices linked to the account by the platform's device providers, when the server has any (`status().deviceLinks`). */
  deviceLinks: async (): Promise<DeviceLink[]> => {
    const { data, error } = await client.$fetch<{ links: DeviceLink[] }>('/account/device-links', { method: 'GET' })
    if (error || !data) throw authError(error, 'Could not read your devices')
    return data.links
  },

  /** Signs a linked device out for good: its link goes, its sessions end, and it never signs in again. */
  signOutDeviceLink: async (id: string) => {
    const { error } = await client.$fetch('/account/device-links/sign-out', { method: 'POST', body: { id } })
    if (error) throw authError(error, 'Could not sign out the device')
  },
})
