import { authError } from './auth-error'
import type { BetterAuthClient } from './better-auth-client'
import type { SignInPolicy } from './sign-in-policy'

/** What a sign-in policy can require that an account sets up once. */
export type RequiredSetup = 'twoFactor' | 'passkey'

/**
 * The signed-in account's ways to sign in: the policy as it applies, whether mail is on (for emailed codes), what the
 * account has (a password, how many passkeys, two-factor authentication, and whether that has an authenticator app
 * with backup codes or only emailed codes), and what the policy requires that it lacks.
 */
export type AccountSignIn = {
  policy: SignInPolicy
  mail: boolean
  account: { password: boolean; passkeys: number; twoFactor: boolean; authenticatorApp: boolean }
  missing: RequiredSetup[]
}

export type Passkey = { id: string; name?: string; createdAt?: string; backedUp: boolean }

/** A new authenticator app: the `otpauth://` URI it scans, and the backup codes that work once each instead of a code. */
export type AuthenticatorSetup = { totpURI: string; backupCodes: string[] }

/**
 * The signed-in person's passkeys and two-factor authentication. `password` is asked for by the changes that need it
 * when the account has one. Each call rejects with `AuthError`.
 */
export const accountSecurity = (client: BetterAuthClient) => ({
  signInMethods: async (): Promise<AccountSignIn> => {
    const { data, error } = await client.$fetch<AccountSignIn>('/account/sign-in-methods')
    if (error || !data) throw authError(error, 'Could not read your sign-in methods')
    return data
  },

  passkeys: async (): Promise<Passkey[]> => {
    const { data, error } = await client.passkey.listUserPasskeys()
    if (error || !data) throw authError(error, 'Could not read your passkeys')
    return data.map((key) => ({ id: key.id, backedUp: key.backedUp, ...(key.name && { name: key.name }), ...(key.createdAt && { createdAt: new Date(key.createdAt).toISOString() }) }))
  },

  /** Asks the browser to create a passkey for this site, named `name` in the list. */
  addPasskey: async (name?: string) => {
    const { error } = await client.passkey.addPasskey(name ? { name } : {})
    if (error) throw authError(error, 'Could not add the passkey')
  },

  renamePasskey: async (id: string, name: string) => {
    const { error } = await client.passkey.updatePasskey({ id, name })
    if (error) throw authError(error, 'Could not rename the passkey')
  },

  removePasskey: async (id: string) => {
    const { error } = await client.passkey.deletePasskey({ id })
    if (error) throw authError(error, 'Could not remove the passkey')
  },

  /** Starts two-factor authentication with an authenticator app; it is on once `confirmAuthenticatorApp` takes a code from the app. */
  startAuthenticatorApp: async (password?: string): Promise<AuthenticatorSetup> => {
    const { data, error } = await client.twoFactor.enable({ method: 'totp', ...(password && { password }) })
    if (error || data?.method !== 'totp') throw authError(error, 'Could not start two-factor authentication')
    return { totpURI: data.totpURI, backupCodes: data.backupCodes }
  },

  confirmAuthenticatorApp: async (code: string) => {
    const { error } = await client.twoFactor.verifyTotp({ code })
    if (error) throw authError(error, 'The code did not work')
  },

  /** Turns on two-factor authentication with a code emailed at each sign-in. */
  turnOnEmailedCodes: async (password?: string) => {
    const { error } = await client.twoFactor.enable({ method: 'otp', ...(password && { password }) })
    if (error) throw authError(error, 'Could not turn on two-factor authentication')
  },

  turnOffTwoFactor: async (password?: string) => {
    const { error } = await client.twoFactor.disable(password ? { password } : {})
    if (error) throw authError(error, 'Could not turn off two-factor authentication')
  },

  /** New backup codes for the authenticator app; the old ones stop working. */
  newBackupCodes: async (password?: string) => {
    const { data, error } = await client.twoFactor.generateBackupCodes(password ? { password } : {})
    if (error || !data) throw authError(error, 'Could not make new backup codes')
    return data.backupCodes
  },
})

export type AccountSecurity = ReturnType<typeof accountSecurity>
