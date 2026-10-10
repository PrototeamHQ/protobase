import { authError } from './auth-error'
import type { AuthUser, SignInResult, TwoFactorMethod } from './auth-types'
import type { BetterAuthClient } from './better-auth-client'

type SignInAnswer = { user?: unknown; twoFactorRedirect?: boolean; twoFactorMethods?: TwoFactorMethod[] } | null

/**
 * The ways to sign in: a password, an emailed code or a passkey, and the second step after a password or a code for
 * an account with two-factor authentication. `signedIn` runs once a session exists, to fetch the API token.
 */
export const signInFlows = (client: BetterAuthClient, signedIn: () => Promise<unknown>) => {
  // Better Auth answers a sign-in that needs a second step with `twoFactorRedirect` instead of the user.
  const finish = async (data: SignInAnswer): Promise<SignInResult> => {
    if (data?.twoFactorRedirect) return { kind: 'two-factor', methods: data.twoFactorMethods ?? [] }
    await signedIn()
    return { kind: 'signed-in', user: data?.user as AuthUser }
  }

  return {
    signIn: async (email: string, password: string) => {
      const { data, error } = await client.signIn.email({ email, password })
      if (error || !data) throw authError(error, 'Sign-in failed')
      return finish(data as SignInAnswer)
    },

    /** Emails a sign-in code when an account has this address; the answer is the same either way. */
    sendSignInCode: async (email: string) => {
      const { error } = await client.emailOtp.sendVerificationOtp({ email, type: 'sign-in' })
      if (error) throw authError(error, 'Could not send the code')
    },

    signInWithCode: async (email: string, code: string) => {
      const { data, error } = await client.signIn.emailOtp({ email, otp: code })
      if (error || !data) throw authError(error, 'Sign-in failed')
      return finish(data as SignInAnswer)
    },

    /** Asks the browser for one of the person's passkeys for this site. */
    signInWithPasskey: async (): Promise<AuthUser> => {
      const { data, error } = await client.signIn.passkey()
      if (error || !data) throw authError(error, 'Sign-in failed')
      await signedIn()
      return data.user as AuthUser
    },

    /** Emails the code for the second step, to the address of the account signing in. */
    sendTwoFactorCode: async () => {
      const { error } = await client.twoFactor.sendOtp()
      if (error) throw authError(error, 'Could not send the code')
    },

    /** Finishes a sign-in with the second step. `trustDevice` skips it in this browser for 30 days. */
    verifyTwoFactor: async ({ method, code, trustDevice = false }: { method: TwoFactorMethod | 'backup'; code: string; trustDevice?: boolean }): Promise<AuthUser> => {
      const verify = method === 'totp' ? client.twoFactor.verifyTotp : method === 'otp' ? client.twoFactor.verifyOtp : client.twoFactor.verifyBackupCode
      const { data, error } = await verify({ code, trustDevice })
      if (error || !data) throw authError(error, 'The code did not work')
      await signedIn()
      return data.user as AuthUser
    },
  }
}
