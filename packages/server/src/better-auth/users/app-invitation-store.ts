import type { Where } from 'better-auth'
import { sql } from 'kysely'
import type { AuthContext } from '../organizations/store'
import { storeSqlOf } from '../store/store-sql'

// An invitation to the app itself, for apps without organizations or for people outside them: a row of Better Auth's
// verification table, its own store for short-lived tokens, so no table of Protobase's. The identifier carries the id,
// the value the address, the roles and who invited, as JSON, the address first. Written against better-auth 1.7.7.

export type AppInvitation = { id: string; email: string; roles: string[]; inviterId: string; expiresAt: Date }

type Row = { identifier: string; value: string; expiresAt: Date | string }

const prefix = 'app-invitation:'

const invitationOf = (row: Row): AppInvitation => {
  const { email, roles, inviterId } = JSON.parse(row.value) as Omit<AppInvitation, 'id' | 'expiresAt'>
  return { id: row.identifier.slice(prefix.length), email, roles, inviterId, expiresAt: new Date(row.expiresAt) }
}

const pending = (invitation: AppInvitation) => invitation.expiresAt.getTime() > Date.now()

// Postgres's LIKE takes `%` and `_` as wildcards and a backslash before one as itself; Better Auth's `starts_with` escapes none.
const likeLiteral = (text: string) => text.replace(/[\\%_]/g, (char) => `\\${char}`)

/** The app invitations of `email`, expired ones too: the rows whose value starts with its address, which is written first. */
const invitationsOf = (email: string): Where[] => [
  { field: 'identifier', operator: 'starts_with', value: prefix },
  { field: 'value', operator: 'starts_with', value: likeLiteral(`{"email":${JSON.stringify(email)},`) },
]

/** The pending app invitations, oldest first, as Postgres filters and orders them; expired ones are left out. */
export const listAppInvitations = async (context: AuthContext) => {
  const store = storeSqlOf(context)
  const verification = store.table('verification')
  const { identifier, value, expires_at, created_at } = verification.columns
  const { rows } = await sql<Row>`select ${identifier} as identifier, ${value} as value, ${expires_at} as "expiresAt" from ${verification}
    where ${identifier} like ${sql.lit(`${prefix}%`)} and ${expires_at} > ${new Date()} order by ${created_at}, id`.execute(store.db)
  return rows.map(invitationOf)
}

/** The pending app invitation with `id`, or `undefined` when there is none or it expired. */
export const findAppInvitation = async (context: AuthContext, id: string) => {
  const row = await context.internalAdapter.findVerificationValue(`${prefix}${id}`)
  const invitation = row ? invitationOf(row) : undefined
  return invitation && pending(invitation) ? invitation : undefined
}

/** The pending app invitation of `email`, or `undefined`; inviting an address again replaces its invitation, so it has one at most. */
export const findAppInvitationOf = async (context: AuthContext, email: string) => {
  const where: Where[] = [...invitationsOf(email.toLowerCase()), { field: 'expiresAt', operator: 'gt', value: new Date() }]
  const row = await context.adapter.findOne<Row>({ model: 'verification', where })
  return row ? invitationOf(row) : undefined
}

export const deleteAppInvitation = (context: AuthContext, id: string) => context.internalAdapter.deleteVerificationByIdentifier(`${prefix}${id}`)

/** Invites `email` with `roles` for `lifetimeSeconds`; an earlier invitation of the same address is replaced, so its link stops working. */
export const createAppInvitation = async (context: AuthContext, input: { email: string; roles: string[]; inviterId: string }, lifetimeSeconds: number) => {
  const email = input.email.toLowerCase()
  await context.adapter.deleteMany({ model: 'verification', where: invitationsOf(email) })
  const invitation = { id: crypto.randomUUID(), email, roles: input.roles, inviterId: input.inviterId, expiresAt: new Date(Date.now() + lifetimeSeconds * 1000) }
  await context.internalAdapter.createVerificationValue({
    identifier: `${prefix}${invitation.id}`,
    value: JSON.stringify({ email, roles: invitation.roles, inviterId: invitation.inviterId }),
    expiresAt: invitation.expiresAt,
  })
  return invitation
}
