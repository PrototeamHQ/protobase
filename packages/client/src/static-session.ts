import type { AuthSession } from './auth'
import { AuthError } from './auth-error'
import type { AuthUser } from './auth-types'

const unsupported = (what: string) => async (): Promise<never> => {
  throw new AuthError(`A static session cannot ${what}`, 400)
}

/**
 * A session that is already signed in with a token you hold, for stories and scripts (`protobase token <email>`).
 * It never refreshes, so use a token that outlives the run. Its account has nothing to set up, and it cannot change
 * passkeys, two-factor authentication, the sign-in policy or organizations, and is never a staff session.
 */
export const createStaticSession = (token: string, user: AuthUser = { id: 'token', email: 'token', name: 'API token', role: null }): AuthSession => ({
  token: async () => token,
  status: async () => ({ needsAdmin: false, signInMethods: ['password'], passwordReset: false, socialProviders: [] }),
  session: async () => user,
  signIn: async () => ({ kind: 'signed-in', user }),
  sendSignInCode: async () => undefined,
  signInWithCode: async () => ({ kind: 'signed-in', user }),
  signInWithPasskey: async () => user,
  sendTwoFactorCode: async () => undefined,
  verifyTwoFactor: async () => user,
  signInSocial: unsupported('sign in with a provider'),
  signOut: async () => undefined,
  requestPasswordReset: async () => undefined,
  resetPassword: async () => undefined,
  account: {
    signInMethods: async () => ({
      policy: { password: 'allowed', emailCode: 'allowed', passkey: 'allowed', twoFactor: 'allowed', staffAccess: 'allowed', platformSignIn: 'allowed' },
      mail: false,
      account: { password: false, passkeys: 0, twoFactor: false, authenticatorApp: false },
      missing: [],
    }),
    passkeys: async () => [],
    addPasskey: unsupported('add a passkey'),
    renamePasskey: unsupported('rename a passkey'),
    removePasskey: unsupported('remove a passkey'),
    startAuthenticatorApp: unsupported('turn on two-factor authentication'),
    confirmAuthenticatorApp: unsupported('turn on two-factor authentication'),
    turnOnEmailedCodes: unsupported('turn on two-factor authentication'),
    turnOffTwoFactor: unsupported('turn off two-factor authentication'),
    newBackupCodes: unsupported('make backup codes'),
    linkedProviders: async () => [],
    linkProvider: unsupported('link a sign-in provider'),
  },
  signInPolicy: { read: unsupported('read the sign-in policy'), save: unsupported('save the sign-in policy') },
  staff: { start: unsupported('start a staff sign-in'), current: async () => undefined, stop: unsupported('end a staff session'), log: unsupported('read the staff sign-ins') },
  organizations: {
    list: async () => [],
    current: async () => ({ organization: null, globalRoles: [] }),
    switchTo: unsupported('switch organizations'),
    search: async () => [],
    create: unsupported('create an organization'),
    rename: unsupported('change an organization'),
    remove: unsupported('delete an organization'),
    leave: unsupported('leave an organization'),
    members: async () => [],
    setRole: unsupported('change a role'),
    setAppRoles: unsupported('change app roles'),
    removeMember: unsupported('remove a member'),
    transferOwnership: unsupported('hand an organization over'),
    invitations: async () => [],
    invite: unsupported('invite people'),
    resend: unsupported('invite people'),
    revoke: unsupported('revoke an invitation'),
    myInvitations: async () => [],
    invitation: unsupported('read an invitation'),
    accept: unsupported('accept an invitation'),
    signUpFromInvitation: unsupported('accept an invitation'),
  },
})
