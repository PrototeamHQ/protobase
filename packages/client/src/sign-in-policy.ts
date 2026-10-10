import { authError } from './auth-error'
import type { BetterAuthClient } from './better-auth-client'

export type SignInRule = 'allowed' | 'required' | 'forbidden'

/**
 * How people may sign in, as the server stores it: passwords and emailed codes are allowed or forbidden, passkeys and
 * two-factor authentication can also be required (everyone without one is asked to set it up).
 */
export type SignInPolicy = {
  password: 'allowed' | 'forbidden'
  emailCode: 'allowed' | 'forbidden'
  passkey: SignInRule
  twoFactor: SignInRule
}

/** The saved policy, how it applies (`effective`: emailed codes need mail, and without mail passwords stay on), and who saved it when. */
export type SignInPolicyState = { policy: SignInPolicy; effective: SignInPolicy; mail: boolean; savedAt?: string; savedBy?: string }

/** Reading and saving the sign-in policy, for admins. Saving rejects with `AuthError` saying why a policy cannot be saved. */
export const signInPolicyClient = (client: BetterAuthClient) => ({
  read: async () => {
    const { data, error } = await client.$fetch<SignInPolicyState>('/policy/sign-in')
    if (error || !data) throw authError(error, 'Could not read the sign-in policy')
    return data
  },

  save: async (policy: SignInPolicy) => {
    const { data, error } = await client.$fetch<SignInPolicyState>('/policy/sign-in', { method: 'POST', body: policy })
    if (error || !data) throw authError(error, 'Could not save the sign-in policy')
    return data
  },
})

export type SignInPolicyClient = ReturnType<typeof signInPolicyClient>
