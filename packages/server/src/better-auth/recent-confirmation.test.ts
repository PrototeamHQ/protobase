import { describe, expect, it } from 'vitest'
import { confirmationAsked } from './recent-confirmation'

// An account with or without a password, and with or without a passkey, as the store answers for it.
const account = ({ password = false, passkey = false }) =>
  ({
    adapter: { count: async () => (passkey ? 1 : 0) },
    internalAdapter: { findCredentialAccount: async () => (password ? { password: 'hash' } : null) },
  }) as never

const signedIn = { session: { id: 'session-1', createdAt: new Date() }, user: { id: 'user-1', twoFactorEnabled: false } }
const withSecondStep = { ...signedIn, user: { ...signedIn.user, twoFactorEnabled: true } }
const twoFactorPaths = ['/two-factor/enable', '/two-factor/get-totp-uri', '/two-factor/generate-backup-codes']

describe('confirmationAsked', () => {
  it("asks an account without a password to confirm on the second step's endpoints", async () => {
    for (const path of twoFactorPaths) {
      expect(await confirmationAsked(account({}), path, {}, signedIn)).toBe('confirm')
      expect(await confirmationAsked(account({ passkey: true }), path, {}, signedIn)).toBe('confirm')
      expect(await confirmationAsked(account({}), path, {}, withSecondStep)).toBe('confirm')
    }
  })

  it("leaves the second step's endpoints of an account with a password to Better Auth's password check", async () => {
    for (const path of twoFactorPaths) expect(await confirmationAsked(account({ password: true }), path, {}, withSecondStep)).toBe('nothing')
  })

  it('takes the password for a first passkey only', async () => {
    expect(await confirmationAsked(account({ password: true }), '/passkey/verify-registration', {}, signedIn)).toBe('confirm-or-password')
    expect(await confirmationAsked(account({ password: true, passkey: true }), '/passkey/verify-registration', {}, signedIn)).toBe('confirm')
    expect(await confirmationAsked(account({ password: true }), '/passkey/verify-registration', {}, withSecondStep)).toBe('confirm')
  })
})
