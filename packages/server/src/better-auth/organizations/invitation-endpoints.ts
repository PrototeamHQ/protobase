import { createAuthEndpoint, sessionMiddleware } from 'better-auth/api'
import * as z from 'zod'
import { acceptInvitation, invitationOfToken } from './accept-invitation'
import type { ResolvedOrganizations } from './options'

/**
 * Accepting an organization's emailed invitation signed in. What a link is for, and making an account from it, are the
 * shared invitation endpoints (`invitations/invitation-endpoints.ts`), which serve invitations to the app as well.
 */
export const invitationEndpoints = ({ resolved }: { resolved: ResolvedOrganizations }) => ({
  /** `POST /invitation/accept` with `{ token }`, signed in as the invited address: becomes a member, and works there. */
  acceptInvitation: createAuthEndpoint('/invitation/accept', { method: 'POST', body: z.object({ token: z.string().min(1) }), use: [sessionMiddleware] }, async (ctx) => {
    const invitation = await invitationOfToken(ctx.context, ctx.body.token)
    const { user, session } = ctx.context.session
    const member = await acceptInvitation(ctx.context, invitation, user, resolved.membershipLimit)
    await ctx.context.internalAdapter.updateSession(session.token, { activeOrganizationId: invitation.organizationId })
    return ctx.json({ member })
  }),
})
