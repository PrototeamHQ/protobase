import { APIError } from 'better-auth/api'
import { parseAppRoles } from './app-roles'
import { invitationIdOf, verifyInvitationToken } from './invitation-token'
import { findMember, membersOf, type AuthContext, type StoredMember } from './store'

export type StoredInvitation = {
  id: string
  organizationId: string
  email: string
  role: string
  appRoles: string[]
  status: string
  expiresAt: Date
  inviterId: string
}

const invalid = { code: 'INVITATION_INVALID', message: 'This invitation link is not valid any more: it was used, revoked, replaced by a newer one, or it expired.' }

/** The pending invitation an emailed link's token names, or a 400 `INVITATION_INVALID`. */
export const invitationOfToken = async (context: AuthContext, token: string): Promise<StoredInvitation> => {
  const id = invitationIdOf(token)
  const row = id && (await context.adapter.findOne<Omit<StoredInvitation, 'appRoles'> & { appRoles?: unknown }>({ model: 'invitation', where: [{ field: 'id', value: id }] }))
  if (!row || !(await verifyInvitationToken(context.secret, token, row))) throw new APIError('BAD_REQUEST', invalid)
  if (row.status !== 'pending' || new Date(row.expiresAt).getTime() < Date.now()) throw new APIError('BAD_REQUEST', invalid)
  return { ...row, appRoles: parseAppRoles(row.appRoles) }
}

/**
 * Makes `user` a member as the invitation says, with its organization role and app roles, in one transaction with the
 * invitation's acceptance, so a member never exists without the app roles they were invited with. Better Auth's own
 * accept leaves the app roles out; it is turned off with organizations.
 */
export const acceptInvitation = async (context: AuthContext, invitation: StoredInvitation, user: { id: string; email: string; emailVerified: boolean }, membershipLimit: number) => {
  if (invitation.email.toLowerCase() !== user.email.toLowerCase()) {
    throw new APIError('FORBIDDEN', { code: 'NOT_THE_INVITED_ADDRESS', message: `This invitation is for ${invitation.email}; sign in with that address to accept it.` })
  }
  if (!user.emailVerified) throw new APIError('FORBIDDEN', { code: 'EMAIL_NOT_VERIFIED', message: 'Verify your email address before accepting an invitation.' })
  if (await findMember(context.adapter, { organizationId: invitation.organizationId, userId: user.id })) {
    throw new APIError('BAD_REQUEST', { code: 'ALREADY_A_MEMBER', message: 'You are a member of this organization already.' })
  }
  if ((await membersOf(context.adapter, invitation.organizationId)).length >= membershipLimit) {
    throw new APIError('FORBIDDEN', { code: 'MEMBERSHIP_LIMIT_REACHED', message: 'This organization has as many members as it can have.' })
  }
  return context.adapter.transaction(async (trx) => {
    const accepted = await trx.update({ model: 'invitation', where: [{ field: 'id', value: invitation.id }, { field: 'status', value: 'pending' }], update: { status: 'accepted' } })
    if (!accepted) throw new APIError('BAD_REQUEST', invalid)
    const member = await trx.create<Record<string, unknown>, Omit<StoredMember, 'appRoles'>>({
      model: 'member',
      data: { organizationId: invitation.organizationId, userId: user.id, role: invitation.role, appRoles: invitation.appRoles, createdAt: new Date() },
    })
    return { ...member, appRoles: invitation.appRoles }
  })
}
