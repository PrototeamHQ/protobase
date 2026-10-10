import { APIError, createAuthEndpoint, createAuthMiddleware, sessionMiddleware } from 'better-auth/api'
import { setSessionCookie } from 'better-auth/cookies'
import * as z from 'zod'
import { readSignInPolicy } from '../policy-store'
import { effectiveSignInPolicy } from '../sign-in-policy'
import { acceptInvitation, invitationOfToken } from './accept-invitation'
import { invitationLink, invitationToken } from './invitation-token'
import type { ResolvedOrganizations } from './options'
import { noGlobalRole } from './role-definitions'
import { findOrganization, type AuthContext } from './store'

const minPasswordLength = 12
const maxPasswordLength = 128

const tokenBody = z.object({ token: z.string().min(1) })

const startIn = (context: AuthContext, sessionToken: string, organizationId: string) => context.internalAdapter.updateSession(sessionToken, { activeOrganizationId: organizationId })

/**
 * The endpoints an emailed invitation link uses: what it is for, accepting it signed in, and creating an account from it
 * for someone who has none. Open sign-up stays off; an invitation is an address someone vouched for, and the link in
 * the mail proves the person reads it.
 */
export const invitationEndpoints = ({ resolved, mail }: { resolved: ResolvedOrganizations; mail: boolean }) => ({
  /** `GET /invitation?token=`: the organization, who invites, the address and roles, until when, and whether the address has an account. */
  getInvitation: createAuthEndpoint('/invitation', { method: 'GET', query: tokenBody }, async (ctx) => {
    const invitation = await invitationOfToken(ctx.context, ctx.query.token)
    const organization = await findOrganization(ctx.context.adapter, invitation.organizationId)
    const inviter = await ctx.context.internalAdapter.findUserById(invitation.inviterId)
    const account = await ctx.context.internalAdapter.findUserByEmail(invitation.email.toLowerCase())
    return ctx.json({
      organization: { id: invitation.organizationId, name: organization?.name ?? '' },
      inviter: { name: inviter?.name || inviter?.email || '' },
      email: invitation.email,
      role: invitation.role,
      appRoles: invitation.appRoles,
      expiresAt: new Date(invitation.expiresAt).toISOString(),
      hasAccount: Boolean(account),
    })
  }),

  /** `POST /invitation/accept` with `{ token }`, signed in as the invited address: becomes a member, and works there. */
  acceptInvitation: createAuthEndpoint('/invitation/accept', { method: 'POST', body: tokenBody, use: [sessionMiddleware] }, async (ctx) => {
    const invitation = await invitationOfToken(ctx.context, ctx.body.token)
    const { user, session } = ctx.context.session
    const member = await acceptInvitation(ctx.context, invitation, user, resolved.membershipLimit)
    await startIn(ctx.context, session.token, invitation.organizationId)
    return ctx.json({ member })
  }),

  /**
   * `POST /invitation/sign-up` with `{ token, name, password? }`, for an address without an account: creates it, as
   * verified and with no global role, accepts the invitation and signs the person in there. A password is needed unless
   * the sign-in policy offers emailed codes; the policy's required methods are then set up as after any sign-in.
   */
  signUpFromInvitation: createAuthEndpoint(
    '/invitation/sign-up',
    { method: 'POST', body: z.object({ token: z.string().min(1), name: z.string().trim().min(1).max(200), password: z.string().optional() }) },
    async (ctx) => {
      const invitation = await invitationOfToken(ctx.context, ctx.body.token)
      const { internalAdapter } = ctx.context
      if (await internalAdapter.findUserByEmail(invitation.email.toLowerCase())) {
        throw new APIError('BAD_REQUEST', { code: 'ACCOUNT_EXISTS', message: 'This address has an account already: sign in to accept the invitation.' })
      }
      const policy = effectiveSignInPolicy((await readSignInPolicy(ctx.context.adapter)).policy, { mail })
      const { password } = ctx.body
      if (password !== undefined && policy.password === 'forbidden') {
        throw new APIError('BAD_REQUEST', { code: 'SIGN_IN_METHOD_FORBIDDEN', message: 'This app does not sign in with passwords; leave the password out.' })
      }
      if (password === undefined && policy.emailCode !== 'allowed') {
        throw new APIError('BAD_REQUEST', { code: 'PASSWORD_REQUIRED', message: 'Choose a password to sign in with.' })
      }
      if (password !== undefined && (password.length < minPasswordLength || password.length > maxPasswordLength)) {
        throw new APIError('BAD_REQUEST', { code: 'PASSWORD_LENGTH', message: `Choose a password of ${minPasswordLength} to ${maxPasswordLength} characters.` })
      }
      const user = await internalAdapter.createUser({ email: invitation.email.toLowerCase(), name: ctx.body.name, emailVerified: true, role: noGlobalRole }, { method: 'invitation' })
      if (password !== undefined) {
        await internalAdapter.linkAccount({ userId: user.id, providerId: 'credential', accountId: user.id, password: await ctx.context.password.hash(password) })
      }
      const member = await acceptInvitation(ctx.context, invitation, user, resolved.membershipLimit)
      const session = await internalAdapter.createSession(user.id, false)
      await startIn(ctx.context, session.token, invitation.organizationId)
      await setSessionCookie(ctx, { session: { ...session, activeOrganizationId: invitation.organizationId } as typeof session, user })
      return ctx.json({ member })
    },
  ),
})

/**
 * Without a mailer the invitation cannot be emailed, so whoever invites gets its link in the answer, once, to pass on.
 * Resending gives a new link, since it moves the expiry.
 */
export const invitationLinkHook = (resolved: ResolvedOrganizations) => ({
  matcher: (context: { path?: string }) => context.path === '/organization/invite-member',
  handler: createAuthMiddleware(async (ctx) => {
    const returned = ctx.context.returned as { id?: string; expiresAt?: Date | string } | undefined
    if (!returned || returned instanceof Response || returned instanceof Error || !returned.id || !returned.expiresAt) return
    const token = await invitationToken(ctx.context.secret, { id: returned.id, expiresAt: new Date(returned.expiresAt) })
    ctx.context.returned = { ...returned, link: invitationLink(resolved.invitationUrl, token) }
  }),
})
