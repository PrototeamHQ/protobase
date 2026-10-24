import { createAuthEndpoint, sessionMiddleware } from 'better-auth/api'
import * as z from 'zod'
import { acceptInvitation, invitationOfId, invitationOfToken, type StoredInvitation } from './accept-invitation'
import type { ResolvedOrganizations } from './options'
import type { AuthContext } from './store'

type SignedIn = AuthContext & { session: { user: { id: string; email: string; emailVerified: boolean }; session: { token: string } } }

// Becomes a member as the invitation says, and works in its organization.
const accept = async (context: SignedIn, invitation: StoredInvitation, membershipLimit: number) => {
  const { user, session } = context.session
  const member = await acceptInvitation(context, invitation, user, membershipLimit)
  await context.internalAdapter.updateSession(session.token, { activeOrganizationId: invitation.organizationId })
  return { member }
}

/**
 * Accepting an organization's invitation signed in, from its emailed link or from the person's own invitations (Better
 * Auth's `GET /organization/list-user-invitations`). What a link is for, and making an account from it, are the shared
 * invitation endpoints (`invitations/invitation-endpoints.ts`), which serve invitations to the app as well.
 */
export const invitationEndpoints = ({ resolved }: { resolved: ResolvedOrganizations }) => ({
  /** `POST /invitation/accept` with `{ token }`, signed in as the invited address: becomes a member, and works there. */
  acceptInvitationOfLink: createAuthEndpoint('/invitation/accept', { method: 'POST', body: z.object({ token: z.string().min(1) }), use: [sessionMiddleware] }, async (ctx) =>
    ctx.json(await accept(ctx.context, await invitationOfToken(ctx.context, ctx.body.token), resolved.membershipLimit)),
  ),

  /** `POST /invitation/accept-own` with `{ invitationId }`, signed in as the invited address: the same, from their list. */
  acceptOwnInvitation: createAuthEndpoint('/invitation/accept-own', { method: 'POST', body: z.object({ invitationId: z.string().min(1) }), use: [sessionMiddleware] }, async (ctx) =>
    ctx.json(await accept(ctx.context, await invitationOfId(ctx.context, ctx.body.invitationId), resolved.membershipLimit)),
  ),
})
