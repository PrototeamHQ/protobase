import { startAuthentication, WebAuthnError, type PublicKeyCredentialRequestOptionsJSON } from '@simplewebauthn/browser'
import { AuthError, authError } from './auth-error'
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

    /**
     * Open sign-up, when the status has `signUp`: emails a code for making an account with the address. The answer is
     * the same when the address has an account already; that address is mailed a note instead of a code.
     */
    sendSignUpCode: async (email: string) => {
      const { error } = await client.$fetch('/sign-up/send-code', { method: 'POST', body: { email } })
      if (error) throw authError(error, 'Could not send the code')
    },

    /**
     * Checks the code emailed to `email` on its own, before anything else is asked, and answers the ticket that makes the
     * account with `signUp`. A ticket works once, for 30 minutes; a wrong code rejects with `SIGN_UP_CODE_INVALID`.
     */
    verifySignUpCode: async (email: string, code: string): Promise<string> => {
      const { data, error } = await client.$fetch<{ ticket: string }>('/sign-up/verify-code', { method: 'POST', body: { email, code } })
      if (error || !data) throw authError(error, 'Could not check the code')
      return data.ticket
    },

    /**
     * Makes the account for the address whose code `verifySignUpCode` took, with the ticket it answered, the person's
     * name and a password (optional when the server offers emailed sign-in codes), and signs in with it.
     */
    signUp: async (input: { ticket: string; name: string; password?: string }): Promise<AuthUser> => {
      const { data, error } = await client.$fetch<{ user: AuthUser }>('/sign-up/create', { method: 'POST', body: input })
      if (error || !data) throw authError(error, 'Could not create your account')
      await signedIn()
      return data.user
    },

    /**
     * Asks the browser for one of the person's passkeys made for `domain`, one of the status's `passkeyDomains`, or for
     * the app's passkey domain when left out. A browser asks for the passkeys of one domain at a time.
     */
    signInWithPasskey: async (domain?: string): Promise<AuthUser> => {
      const options = await client.$fetch<PublicKeyCredentialRequestOptionsJSON>('/passkey/generate-authenticate-options', { method: 'GET', ...(domain && { query: { rpId: domain } }) })
      if (options.error || !options.data) throw authError(options.error, 'Sign-in failed')
      const answer = await startAuthentication({ optionsJSON: options.data }).catch((error: unknown) => {
        // Closed, timed out, or no passkey chosen: the browser does not tell these apart.
        throw new AuthError('Auth cancelled', 400, error instanceof WebAuthnError ? error.code : 'AUTH_CANCELLED')
      })
      const { clientExtensionResults: _, ...response } = answer
      const verified = await client.$fetch<{ user: unknown }>('/passkey/verify-authentication', { method: 'POST', body: { response } })
      if (verified.error || !verified.data) throw authError(verified.error, 'Sign-in failed')
      await signedIn()
      return verified.data.user as AuthUser
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
