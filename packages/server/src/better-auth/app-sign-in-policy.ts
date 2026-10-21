import { defaultSignInPolicy, parseSignInPolicy, signInPolicyProblem, type SignInPolicy } from './sign-in-policy'

// The first admin, made on the host, who has set nothing up yet but maybe a password.
const firstAdmin = { password: true, passkeys: 0, twoFactor: false, authenticatorApp: false, socialSignIn: false }

/**
 * The policy an app applies until an admin saves one: `defaultSignInPolicy` with the methods `given` names changed.
 * It is checked as an admin's save is, with mail on: without mail the policy applies as a saved one does (see
 * `effectiveSignInPolicy`), so a missing mail setting turns passwords back on rather than stopping the app.
 */
export const appSignInPolicy = (given: Partial<SignInPolicy> = {}): SignInPolicy => {
  const policy = parseSignInPolicy({ ...defaultSignInPolicy, ...given })
  if (!policy) throw new Error('signInPolicy: choose one of the offered rules for every sign-in method (see signInPolicyMethods)')
  const problem = signInPolicyProblem(policy, { mail: true, admin: firstAdmin })
  if (problem) throw new Error(`signInPolicy: ${problem}`)
  return policy
}
