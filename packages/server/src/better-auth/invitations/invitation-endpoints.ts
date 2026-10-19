import { APIError, createAuthEndpoint } from 'better-auth/api'
import * as z from 'zod'
import { acceptInvitation } from '../organizations/accept-invitation'
import type { ResolvedOrganizations } from '../organizations/options'
import { noGlobalRole } from '../organizations/role-definitions'
import { findOrganization } from '../organizations/store'
import { deleteAppInvitation } from '../users/app-invitation-store'
import { createInvitedAccount, signInInvitedAccount } from './account-from-invitation'
import { invitationOfToken } from './invitation-of-token'

const tokenQuery = z.object({ token: z.string().min(1) })

/**
 * The endpoints an emailed invitation link opens, to the app or, with organizations, to one of them: what it is for,
 * and creating an account from it for someone who has none. Open sign-up stays off; an invitation is an address someone
 * vouched for, and the link in the mail proves the person reads it. Accepting an organization's invitation signed in is
 * the organization plugin's.
 */
export const invitationEndpoints = ({ mail, organizations }: { mail: boolean; organizations?: ResolvedOrganizations }) => ({
  /**
   * `GET /invitation?token=`: who invites, the address and roles, until when, and whether the address has an account;
   * for an organization's invitation also the organization and the role there.
   */
  getInvitation: createAuthEndpoint('/invitation', { method: 'GET', query: tokenQuery }, async (ctx) => {
    const found = await invitationOfToken(ctx.context, ctx.query.token, { organizations: Boolean(organizations) })
    const { invitation } = found
    const inviter = await ctx.context.internalAdapter.findUserById(invitation.inviterId)
    const account = await ctx.context.internalAdapter.findUserByEmail(invitation.email.toLowerCase())
    const common = { inviter: { name: inviter?.name || inviter?.email || '' }, email: invitation.email, expiresAt: new Date(invitation.expiresAt).toISOString(), hasAccount: Boolean(account) }
    if (found.kind === 'app') return ctx.json({ ...common, appRoles: found.invitation.roles })
    const organization = await findOrganization(ctx.context.adapter, found.invitation.organizationId)
    return ctx.json({ organization: { id: found.invitation.organizationId, name: organization?.name ?? '' }, ...common, role: found.invitation.role, appRoles: found.invitation.appRoles })
  }),

  /**
   * `POST /invitation/sign-up` with `{ token, name, password? }`, for an address without an account: creates it, as
   * verified, and signs the person in. An invitation to the app gives the account its roles; one to an organization
   * gives no global role, and accepts the membership, where the session then works.
   */
  signUpFromInvitation: createAuthEndpoint(
    '/invitation/sign-up',
    { method: 'POST', body: z.object({ token: z.string().min(1), name: z.string().trim().min(1).max(200), password: z.string().optional() }) },
    async (ctx) => {
      const found = await invitationOfToken(ctx.context, ctx.body.token, { organizations: Boolean(organizations) })
      const { email } = found.invitation
      if (await ctx.context.internalAdapter.findUserByEmail(email.toLowerCase())) {
        const message = found.kind === 'app' ? 'This address has an account already: sign in.' : 'This address has an account already: sign in to accept the invitation.'
        throw new APIError('BAD_REQUEST', { code: 'ACCOUNT_EXISTS', message })
      }
      const account = { email, name: ctx.body.name, ...(ctx.body.password !== undefined && { password: ctx.body.password }), mail }
      if (found.kind === 'app') {
        const user = await createInvitedAccount(ctx, { ...account, role: found.invitation.roles.join(',') })
        await deleteAppInvitation(ctx.context, found.invitation.id)
        await signInInvitedAccount(ctx, user)
        return ctx.json({ user: { id: user.id, email: user.email } })
      }
      const user = await createInvitedAccount(ctx, { ...account, role: noGlobalRole })
      const member = await acceptInvitation(ctx.context, found.invitation, user, organizations!.membershipLimit)
      await signInInvitedAccount(ctx, user, found.invitation.organizationId)
      return ctx.json({ member })
    },
  ),
})
