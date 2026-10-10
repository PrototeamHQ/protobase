import { Hono } from 'hono'
import type { AdminAuth } from './create-auth'
import { membershipRoles } from './organizations/role-definitions'
import { readSignInPolicy } from './policy-store'
import { effectiveSignInPolicy } from './sign-in-policy'
import { hasUsers } from './users'

/**
 * `GET {authBase}/status`: `needsAdmin` while the admin store has no user, so a login page can say how to create one;
 * `signInMethods`, the ways to sign in the sign-in policy leaves on (`password`, `emailCode`, `passkey`), so it offers
 * only those; `passwordReset` when reset mail can be sent and passwords are on, so it offers "Forgot password?" only
 * then; the ids of the `socialProviders` people can sign in with, so it offers "Continue with GitHub" when `github` is
 * one; `platformSignIn`, the id and name of the platform's provider when it is one of them; `staffSignIn`, the
 * operator provider's name, when staff can sign in as people; and with organizations, who may create them and the roles
 * with their labels, `membership` for those a member can hold.
 */
export const statusRoute = (auth: AdminAuth) => {
  const app = new Hono()
  app.get('/status', async (c) => {
    const context = await auth.$context
    const policy = effectiveSignInPolicy((await readSignInPolicy(context.adapter)).policy, { mail: auth.mail })
    const signInMethods = [...(policy.password === 'allowed' ? ['password'] : []), ...(policy.emailCode === 'allowed' ? ['emailCode'] : []), ...(policy.passkey !== 'forbidden' ? ['passkey'] : [])]
    const staffSignIn = auth.operator && policy.staffAccess !== 'forbidden' ? auth.operator : undefined
    // A platform provider whose settings could not be read at startup is not registered, and so not offered.
    const platform = auth.platformSignIn
    const platformSignIn = platform && policy.platformSignIn === 'allowed' && context.socialProviders.some((provider) => provider.id === platform.provider) ? platform : undefined
    const socialProviders = [...auth.socialProviders, ...(platformSignIn ? [platformSignIn.provider] : [])]
    return c.json({
      needsAdmin: !(await hasUsers(auth)),
      signInMethods,
      passwordReset: auth.passwordReset && policy.password === 'allowed',
      socialProviders,
      ...(platformSignIn && { platformSignIn }),
      ...(staffSignIn && { staffSignIn }),
      ...(auth.organizations && {
        organizations: {
          create: auth.organizations.create,
          roles: auth.roleDefinitions.names.map((name) => ({ name, label: auth.roleDefinitions.labels[name] ?? name, membership: membershipRoles(auth.roleDefinitions).includes(name) })),
        },
      }),
    })
  })
  return app
}
