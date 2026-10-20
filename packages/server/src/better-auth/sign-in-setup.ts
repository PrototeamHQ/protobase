import type { AuthContext } from './organizations/store'
import { readSignInPolicy } from './policy-store'
import { effectiveSignInPolicy, missingRequiredMethods, type AccountMethods } from './sign-in-policy'

export type SetupUser = { id: string; twoFactorEnabled?: boolean | null }

/** What `user`'s account can sign in with and has set up; `socialProviders` are the provider ids that count as social sign-in. */
export const accountMethods = async (context: AuthContext, user: SetupUser, socialProviders: string[]): Promise<AccountMethods> => {
  const accounts = await context.internalAdapter.findAccounts(user.id)
  const passkeys = await context.adapter.count({ model: 'passkey', where: [{ field: 'userId', value: user.id }] })
  // The two-factor plugin keeps an app's secret in its table, unverified until the app's first code.
  const app = await context.adapter.findOne<{ verified?: boolean | null }>({ model: 'twoFactor', where: [{ field: 'userId', value: user.id }] })
  return {
    password: accounts.some((account) => account.providerId === 'credential'),
    passkeys,
    twoFactor: Boolean(user.twoFactorEnabled),
    authenticatorApp: Boolean(user.twoFactorEnabled) && app !== null && app.verified !== false,
    socialSignIn: accounts.some((account) => socialProviders.includes(account.providerId)),
  }
}

/** The methods the sign-in policy requires that `user` has not set up yet; empty when nothing is missing. */
export const missingSetup = async (context: AuthContext, user: SetupUser, { mail }: { mail: boolean }) => {
  const policy = effectiveSignInPolicy((await readSignInPolicy(context.adapter)).policy, { mail })
  return missingRequiredMethods(policy, await accountMethods(context, user, []))
}
