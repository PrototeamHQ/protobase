import { Hono } from 'hono'
import type { AdminAuth } from './create-auth'
import { readSignInPolicy } from './policy-store'
import { effectiveSignInPolicy } from './sign-in-policy'
import { hasUsers } from './users'

/**
 * `GET {authBase}/status`: `needsAdmin` while the admin store has no user, so a login page can say how to create one;
 * `signInMethods`, the ways to sign in the sign-in policy leaves on (`password`, `emailCode`, `passkey`), so it offers
 * only those; `passwordReset` when reset mail can be sent and passwords are on, so it offers "Forgot password?" only
 * then; and the ids of the configured `socialProviders`, so it offers "Continue with GitHub" when `github` is one.
 */
export const statusRoute = (auth: AdminAuth) => {
  const app = new Hono()
  app.get('/status', async (c) => {
    const policy = effectiveSignInPolicy((await readSignInPolicy((await auth.$context).adapter)).policy, { mail: auth.mail })
    const signInMethods = [...(policy.password === 'allowed' ? ['password'] : []), ...(policy.emailCode === 'allowed' ? ['emailCode'] : []), ...(policy.passkey !== 'forbidden' ? ['passkey'] : [])]
    return c.json({ needsAdmin: !(await hasUsers(auth)), signInMethods, passwordReset: auth.passwordReset && policy.password === 'allowed', socialProviders: auth.socialProviders })
  })
  return app
}
