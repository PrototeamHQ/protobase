import { authError } from './auth-error'
import type { BetterAuthClient } from './better-auth-client'

export type SignInRule = 'allowed' | 'required' | 'forbidden'

/** Whether the operator's staff may sign in as people: yes, yes and the person gets an email, or no. */
export type StaffAccessRule = 'allowed' | 'notify' | 'forbidden'

/**
 * How people may sign in, as the server stores it: passwords and emailed codes are allowed or forbidden, passkeys and
 * two-factor authentication can also be required (everyone without one is asked to set it up), and staff of the
 * operator may sign in as people, with or without telling them, or not.
 */
export type SignInPolicy = {
  password: 'allowed' | 'forbidden'
  emailCode: 'allowed' | 'forbidden'
  passkey: SignInRule
  twoFactor: SignInRule
  staffAccess: StaffAccessRule
}

/**
 * The saved policy, how it applies (`effective`: emailed codes need mail, and without mail passwords stay on and staff
 * who would have to tell the person cannot sign in), the name of the operator provider when staff can sign in at all,
 * and who saved it when.
 */
export type SignInPolicyState = { policy: SignInPolicy; effective: SignInPolicy; mail: boolean; operator?: string; savedAt?: string; savedBy?: string }

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
