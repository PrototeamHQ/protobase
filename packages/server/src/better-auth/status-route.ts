import { Hono } from 'hono'
import type { AdminAuth } from './create-auth'
import { signInPasskeyDomains } from './passkey-domain'
import { membershipRoles } from './organizations/role-definitions'
import { readSignInPolicy } from './policy-store'
import { effectiveSignInPolicy } from './sign-in-policy'
import { hasUsers } from './users'

/**
 * `GET {authBase}/status`: `needsAdmin` while the admin store has no user, so a login page can say how to create one;
 * `signInMethods`, the ways to sign in the sign-in policy leaves on (`password`, `emailCode`, `passkey`), so it offers
 * only those; `passwordReset` when reset mail can be sent and passwords are on, so it offers "Forgot password?" only
 * then; `signUp` when the app has open sign-up, so it offers "Create an account"; the ids of the `socialProviders` people can sign in with, so it offers "Continue with GitHub" when `github` is
 * one; `platformSignIn`, the id and name of the platform's provider when it is one of them; `staffSignIn`, the
 * operator provider's name, when staff can sign in as people; `passkeyDomains`, when people have passkeys for more than
 * one of the app's hosts, the RP IDs a passkey sign-in can ask for, the passkey domain first; with organizations, who may create them and the roles
 * with their labels, `membership` for those a member can hold, and the roles each one's holders may also give; and
 * `anonymous` when the project has an anonymous role, so the admin app opens for visitors before anyone signs in.
 */
export const statusRoute = (auth: AdminAuth, { anonymous = false }: { anonymous?: boolean } = {}) => {
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
    const passkeyDomains = signInMethods.includes('passkey') ? await signInPasskeyDomains(context.adapter, auth.passkeyDomain, auth.origins) : []
    return c.json({
      needsAdmin: !(await hasUsers(auth)),
      signInMethods,
      passwordReset: auth.passwordReset && policy.password === 'allowed',
      ...(auth.signUp && { signUp: true }),
      socialProviders,
      ...(platformSignIn && { platformSignIn }),
      ...(staffSignIn && { staffSignIn }),
      ...(passkeyDomains.length > 1 && { passkeyDomains }),
      ...(anonymous && { anonymous }),
      ...(auth.organizations && {
        organizations: {
          create: auth.organizations.create,
          roles: auth.roleDefinitions.names.map((name) => ({ name, label: auth.roleDefinitions.labels[name] ?? name, membership: membershipRoles(auth.roleDefinitions).includes(name), grants: auth.roleDefinitions.grants[name] ?? [] })),
        },
      }),
    })
  })
  return app
}
