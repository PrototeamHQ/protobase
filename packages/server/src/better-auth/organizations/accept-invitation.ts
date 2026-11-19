import { APIError } from 'better-auth/api'
import { sql } from 'kysely'
import { parseAppRoles } from './app-roles'
import { invalidInvitation, invitationIdOf, verifyInvitationToken } from '../invitations/invitation-token'
import { storeSqlOf } from '../store/store-sql'
import type { AuthContext, StoredMember } from './store'

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

type InvitationRow = Omit<StoredInvitation, 'appRoles'> & { appRoles?: unknown }

const findInvitation = (context: AuthContext, id: string) => context.adapter.findOne<InvitationRow>({ model: 'invitation', where: [{ field: 'id', value: id }] })

const pending = (row: InvitationRow): StoredInvitation => {
  if (row.status !== 'pending' || new Date(row.expiresAt).getTime() < Date.now()) throw new APIError('BAD_REQUEST', invalidInvitation)
  return { ...row, appRoles: parseAppRoles(row.appRoles) }
}

/** The pending invitation an emailed link's token names, or a 400 `INVITATION_INVALID`. */
export const invitationOfToken = async (context: AuthContext, token: string): Promise<StoredInvitation> => {
  const id = invitationIdOf(token)
  const row = id && (await findInvitation(context, id))
  if (!row || !(await verifyInvitationToken(context.secret, token, row))) throw new APIError('BAD_REQUEST', invalidInvitation)
  return pending(row)
}

/** The pending invitation of `id`, or a 400 `INVITATION_INVALID`; only its own address may accept it (`acceptInvitation`). */
export const invitationOfId = async (context: AuthContext, id: string): Promise<StoredInvitation> => {
  const row = await findInvitation(context, id)
  if (!row) throw new APIError('BAD_REQUEST', invalidInvitation)
  return pending(row)
}

/**
 * Makes `user` a member as the invitation says, with its organization role and app roles, in one transaction with the
 * invitation's acceptance, so a member never exists without the app roles they were invited with. The transaction
 * locks the organization's row first, so accepts of one organization take turns: the membership check and the count
 * against `membershipLimit` see every member an earlier accept made. Better Auth's own accept leaves the app roles out;
 * it is turned off with organizations.
 */
export const acceptInvitation = async (context: AuthContext, invitation: StoredInvitation, user: { id: string; email: string; emailVerified: boolean }, membershipLimit: number) => {
  if (invitation.email.toLowerCase() !== user.email.toLowerCase()) {
    throw new APIError('FORBIDDEN', { code: 'NOT_THE_INVITED_ADDRESS', message: `This invitation is for ${invitation.email}; sign in with that address to accept it.` })
  }
  if (!user.emailVerified) throw new APIError('FORBIDDEN', { code: 'EMAIL_NOT_VERIFIED', message: 'Verify your email address before accepting an invitation.' })
  const store = storeSqlOf(context)
  const member = store.table('member')
  const m = member.columns
  const invitations = store.table('invitation')
  return store.db.transaction().execute(async (trx): Promise<StoredMember> => {
    await sql`select from ${store.table('organization')} where id = ${invitation.organizationId} for update`.execute(trx)
    const { rows: [counted] } = await sql<{ members: number; joined: boolean }>`select count(*)::int as members, count(*) filter (where ${m.user_id} = ${user.id}) > 0 as joined
      from ${member} where ${m.organization_id} = ${invitation.organizationId}`.execute(trx)
    if (counted!.joined) throw new APIError('BAD_REQUEST', { code: 'ALREADY_A_MEMBER', message: 'You are a member of this organization already.' })
    if (counted!.members >= membershipLimit) throw new APIError('FORBIDDEN', { code: 'MEMBERSHIP_LIMIT_REACHED', message: 'This organization has as many members as it can have.' })
    const { status } = invitations.columns
    const accepted = await sql`update ${invitations} set ${status} = 'accepted' where id = ${invitation.id} and ${status} = 'pending' returning id`.execute(trx)
    if (accepted.rows.length === 0) throw new APIError('BAD_REQUEST', invalidInvitation)
    const { rows: [made] } = await sql<Omit<StoredMember, 'appRoles'>>`insert into ${member} (id, ${m.organization_id}, ${m.user_id}, ${m.role}, ${m.app_roles}, ${m.created_at})
      values (${store.newId}, ${invitation.organizationId}, ${user.id}, ${invitation.role}, ${JSON.stringify(invitation.appRoles)}::jsonb, ${new Date()})
      returning id, ${m.organization_id} as "organizationId", ${m.user_id} as "userId", ${m.role} as role, ${m.created_at} as "createdAt"`.execute(trx)
    return { ...made!, appRoles: invitation.appRoles }
  })
}
