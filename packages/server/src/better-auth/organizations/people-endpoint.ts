import { APIError, createAuthEndpoint, sessionMiddleware } from 'better-auth/api'
import { everyRow, findMember, membersOf } from './store'

type UserRow = { id: string; name?: string | null; image?: string | null }

/** A member as everyone in the organization may see them: their user id, name and photo, never their address. */
export type Person = { id: string; name: string; image?: string }

/** The people of these users, by name; one without a name is shown by nothing else, so is left out. */
export const peopleOf = (users: readonly UserRow[]): Person[] =>
  users
    .flatMap((user) => (user.name ? [{ id: user.id, name: user.name, ...(user.image && { image: user.image }) }] : []))
    .sort((a, b) => a.name.localeCompare(b.name))

/**
 * `GET /organization/people`: the members of the organization the session works in, for every member of it, as
 * `{ people: Person[] }`, to show authors and offer mentions. The organization comes from the session alone, never
 * from the request, and someone who is not a member of it, a global role included, is refused.
 */
export const peopleEndpoint = createAuthEndpoint('/organization/people', { method: 'GET', use: [sessionMiddleware] }, async (ctx) => {
  const { adapter } = ctx.context
  const { user, session } = ctx.context.session
  const organizationId = (session as { activeOrganizationId?: string | null }).activeOrganizationId
  const member = organizationId ? await findMember(adapter, { organizationId, userId: user.id }) : undefined
  if (!organizationId || !member) throw new APIError('FORBIDDEN', { code: 'NOT_A_MEMBER', message: 'Only the members of the organization you work in can see its people.' })
  const ids = (await membersOf(adapter, organizationId)).map((row) => row.userId)
  const users = await adapter.findMany<UserRow>({ model: 'user', where: [{ field: 'id', operator: 'in', value: ids }], select: ['id', 'name', 'image'], limit: everyRow })
  return ctx.json({ people: peopleOf(users) })
})
