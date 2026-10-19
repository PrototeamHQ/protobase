import type { AuthContext } from '../organizations/store'

// An invitation to the app itself, for apps without organizations or for people outside them: a row of Better Auth's
// verification table, its own store for short-lived tokens, so no table of Protobase's. The identifier carries the id,
// the value the address, the roles and who invited, as JSON. Written against better-auth 1.7.7.

export type AppInvitation = { id: string; email: string; roles: string[]; inviterId: string; expiresAt: Date }

type Row = { identifier: string; value: string; expiresAt: Date | string }

const prefix = 'app-invitation:'

const invitationOf = (row: Row): AppInvitation => {
  const { email, roles, inviterId } = JSON.parse(row.value) as Omit<AppInvitation, 'id' | 'expiresAt'>
  return { id: row.identifier.slice(prefix.length), email, roles, inviterId, expiresAt: new Date(row.expiresAt) }
}

const pending = (invitation: AppInvitation) => invitation.expiresAt.getTime() > Date.now()

const allAppInvitations = async (context: AuthContext) => {
  const rows = await context.adapter.findMany<Row>({
    model: 'verification',
    where: [{ field: 'identifier', operator: 'starts_with', value: prefix }],
    sortBy: { field: 'createdAt', direction: 'asc' },
    limit: 100_000,
  })
  return rows.map(invitationOf)
}

/** The pending app invitations, oldest first; expired ones are left out. */
export const listAppInvitations = async (context: AuthContext) => (await allAppInvitations(context)).filter(pending)

/** The pending app invitation with `id`, or `undefined` when there is none or it expired. */
export const findAppInvitation = async (context: AuthContext, id: string) => {
  const row = await context.internalAdapter.findVerificationValue(`${prefix}${id}`)
  const invitation = row ? invitationOf(row) : undefined
  return invitation && pending(invitation) ? invitation : undefined
}

export const deleteAppInvitation = (context: AuthContext, id: string) => context.internalAdapter.deleteVerificationByIdentifier(`${prefix}${id}`)

/** Invites `email` with `roles` for `lifetimeSeconds`; an earlier invitation of the same address is replaced, so its link stops working. */
export const createAppInvitation = async (context: AuthContext, input: { email: string; roles: string[]; inviterId: string }, lifetimeSeconds: number) => {
  const email = input.email.toLowerCase()
  const earlier = (await allAppInvitations(context)).filter((invitation) => invitation.email === email)
  for (const invitation of earlier) await deleteAppInvitation(context, invitation.id)
  const invitation = { id: crypto.randomUUID(), email, roles: input.roles, inviterId: input.inviterId, expiresAt: new Date(Date.now() + lifetimeSeconds * 1000) }
  await context.internalAdapter.createVerificationValue({
    identifier: `${prefix}${invitation.id}`,
    value: JSON.stringify({ email, roles: invitation.roles, inviterId: invitation.inviterId }),
    expiresAt: invitation.expiresAt,
  })
  return invitation
}
