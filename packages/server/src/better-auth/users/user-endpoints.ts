import { APIError, createAuthEndpoint } from 'better-auth/api'
import * as z from 'zod'
import { adminOnly } from '../admin-only'
import { sendAuthEmail, type AuthMail } from '../auth-mail/send-auth-email'
import { invitationLink, invitationToken } from '../invitations/invitation-token'
import type { RoleDefinitions } from '../organizations/role-definitions'
import { roleLabels } from '../roles/role-labels'
import { createAppInvitation, deleteAppInvitation, listAppInvitations, type AppInvitation } from './app-invitation-store'

const admins = adminOnly('Only an admin manages users.')

const answerOf = ({ id, email, roles, expiresAt }: AppInvitation) => ({ id, email, roles, expiresAt: expiresAt.toISOString() })

export type UserEndpointsOptions = {
  definitions: RoleDefinitions
  /** Mails invitations; without it the inviter gets the link in the answer (`invitationLinkHook`). */
  mail?: AuthMail
  /** The page an invitation link opens, with `?token=`. */
  invitationUrl: string
  /** How long an invitation works, in seconds. */
  invitationSeconds: number
}

/**
 * What an admin manages people with besides Better Auth's admin endpoints, which list, create, set roles and block:
 * invitations to the app by email, which work with or without organizations, and the roles with their labels.
 */
export const userEndpoints = ({ definitions, mail, invitationUrl, invitationSeconds }: UserEndpointsOptions) => ({
  /**
   * `POST /users/invite` with `{ email, roles }`: invites an address without an account to make one, with `roles`, from
   * the link it is mailed. Inviting it again replaces the earlier invitation, so its link stops working.
   */
  inviteUser: createAuthEndpoint(
    '/users/invite',
    { method: 'POST', use: [admins], body: z.object({ email: z.email(), roles: z.array(z.string()).min(1) }) },
    async (ctx) => {
      const unknown = ctx.body.roles.find((role) => !definitions.names.includes(role))
      if (unknown !== undefined) throw new APIError('BAD_REQUEST', { code: 'UNKNOWN_ROLE', message: `Unknown role "${unknown}"; use ${definitions.names.join(', ')}` })
      if (await ctx.context.internalAdapter.findUserByEmail(ctx.body.email.toLowerCase())) {
        throw new APIError('BAD_REQUEST', { code: 'ACCOUNT_EXISTS', message: 'This address has an account already.' })
      }
      const inviter = ctx.context.session.user
      const invitation = await createAppInvitation(ctx.context, { email: ctx.body.email, roles: [...new Set(ctx.body.roles)], inviterId: inviter.id }, invitationSeconds)
      if (mail) {
        const url = invitationLink(invitationUrl, await invitationToken(ctx.context.secret, invitation))
        await sendAuthEmail(mail, 'invitationEmail', invitation.email, { inviter: inviter.name || inviter.email, url, expiresAt: invitation.expiresAt }, url)
      }
      return ctx.json(answerOf(invitation))
    },
  ),

  /** `GET /users/invitations`: the pending invitations to the app, oldest first. */
  listAppInvitations: createAuthEndpoint('/users/invitations', { method: 'GET', use: [admins] }, async (ctx) =>
    ctx.json({ invitations: (await listAppInvitations(ctx.context)).map(answerOf) }),
  ),

  /** `POST /users/invitations/cancel` with `{ id }`: revokes an invitation to the app, so its link stops working. */
  cancelUserInvitation: createAuthEndpoint('/users/invitations/cancel', { method: 'POST', use: [admins], body: z.object({ id: z.string().min(1) }) }, async (ctx) => {
    await deleteAppInvitation(ctx.context, ctx.body.id)
    return ctx.json({ id: ctx.body.id })
  }),

  /** `GET /users/roles`: every role with its label, to choose from when inviting, creating or changing a user. */
  userRoles: createAuthEndpoint('/users/roles', { method: 'GET', use: [admins] }, async (ctx) => ctx.json(roleLabels(definitions))),
})
