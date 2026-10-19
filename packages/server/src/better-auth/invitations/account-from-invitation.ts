import { setSessionCookie } from 'better-auth/cookies'
import { checkNewAccountPassword } from '../new-account-password'
import { readSignInPolicy } from '../policy-store'
import { effectiveSignInPolicy } from '../sign-in-policy'

type EndpointContext = Parameters<typeof setSessionCookie>[0]
type InvitedUser = Parameters<typeof setSessionCookie>[1]['user']

/**
 * Creates the account of an invited address: verified, since the invitation link proves the person reads it, with
 * `role` and, when given, a password checked against the sign-in policy. A password is needed unless the policy offers
 * emailed codes.
 */
export const createInvitedAccount = async (ctx: EndpointContext, input: { email: string; name: string; password?: string; role: string; mail: boolean }) => {
  const { internalAdapter } = ctx.context
  checkNewAccountPassword(effectiveSignInPolicy((await readSignInPolicy(ctx.context.adapter)).policy, { mail: input.mail }), input.password)
  const user = await internalAdapter.createUser({ email: input.email.toLowerCase(), name: input.name, emailVerified: true, role: input.role }, { method: 'invitation' })
  if (input.password !== undefined) {
    await internalAdapter.linkAccount({ userId: user.id, providerId: 'credential', accountId: user.id, password: await ctx.context.password.hash(input.password) })
  }
  return user
}

/** Signs the new account in, in `activeOrganizationId` when given; the policy's required methods are then set up as after any sign-in. */
export const signInInvitedAccount = async (ctx: EndpointContext, user: InvitedUser, activeOrganizationId?: string) => {
  const { internalAdapter } = ctx.context
  const session = await internalAdapter.createSession(user.id, false)
  if (activeOrganizationId === undefined) {
    await setSessionCookie(ctx, { session, user })
    return session
  }
  await internalAdapter.updateSession(session.token, { activeOrganizationId })
  await setSessionCookie(ctx, { session: { ...session, activeOrganizationId } as typeof session, user })
  return session
}
