import type { createAuthMiddleware } from 'better-auth/api'
import { sql, type RawBuilder } from 'kysely'
import { acrossOrganizations, inOrganization } from '../../organization-scope/sign-in-organization'
import { parseAppRoles } from './app-roles'

// Storage goes through Better Auth's adapter, which maps the models and fields to the store's snake_case names.
// Written against better-auth 1.7.7. A read of one organization's members works in that organization
// (`inOrganization`); one across them says why (`acrossOrganizations`).

export type AuthContext = Parameters<Parameters<typeof createAuthMiddleware>[0]>[0]['context']
type Adapter = AuthContext['adapter']

export type OrganizationRole = 'owner' | 'admin' | 'member'

export type StoredMember = { id: string; organizationId: string; userId: string; role: string; appRoles: string[]; createdAt: Date }
export type StoredOrganization = { id: string; name: string; slug: string; logo?: string | null; createdAt: Date }

type MemberRow = Omit<StoredMember, 'appRoles'> & { appRoles?: unknown }

/** Better Auth's `findMany` returns 100 rows unless told otherwise; these lists are read whole. */
export const everyRow = 100_000

const memberOf = (row: MemberRow): StoredMember => ({ ...row, appRoles: parseAppRoles(row.appRoles) })

/** Better Auth stores several organization roles comma separated; Protobase gives each member one. */
export const organizationRoleOf = (member: Pick<StoredMember, 'role'>): OrganizationRole => {
  const roles = member.role.split(',').map((name) => name.trim())
  return roles.includes('owner') ? 'owner' : roles.includes('admin') ? 'admin' : 'member'
}

/** A member who is an owner, in SQL: `owner` is one of the names in their role, as `organizationRoleOf` reads it. */
export const isOwner = (role: RawBuilder<unknown>) => sql`'owner' = any(regexp_split_to_array(regexp_replace(${role}, '^\\s+|\\s+$', '', 'g'), '\\s*,\\s*'))`

/** Someone's membership of the organization named, read in that organization. */
export const findMember = async (adapter: Adapter, where: { organizationId: string; userId: string }) => {
  const row = await inOrganization(where.organizationId, () =>
    adapter.findOne<MemberRow>({ model: 'member', where: [{ field: 'organizationId', value: where.organizationId }, { field: 'userId', value: where.userId }] }),
  )
  return row ? memberOf(row) : undefined
}

/** A membership by its id, whatever its organization: the caller's right to it is checked in its organization next. */
export const findMemberById = async (adapter: Adapter, id: string) => {
  const row = await acrossOrganizations("a member is found by its id, before the caller's right is checked in its organization", () => adapter.findOne<MemberRow>({ model: 'member', where: [{ field: 'id', value: id }] }))
  return row ? memberOf(row) : undefined
}

/** Every organization someone is a member of. */
export const membershipsOf = async (adapter: Adapter, userId: string): Promise<StoredMember[]> =>
  (await acrossOrganizations('a user lists their own memberships, one in each organization', () => adapter.findMany<MemberRow>({ model: 'member', where: [{ field: 'userId', value: userId }], limit: everyRow }))).map(memberOf)

/** The members of the organization named, read in that organization. */
export const membersOf = async (adapter: Adapter, organizationId: string): Promise<StoredMember[]> =>
  (await inOrganization(organizationId, () => adapter.findMany<MemberRow>({ model: 'member', where: [{ field: 'organizationId', value: organizationId }], limit: everyRow }))).map(memberOf)

export const findOrganization = (adapter: Adapter, id: string) =>
  adapter.findOne<StoredOrganization>({ model: 'organization', where: [{ field: 'id', value: id }] })

/** Sets a member's app roles, in the member's organization. */
export const setAppRoles = (adapter: Adapter, member: Pick<StoredMember, 'id' | 'organizationId'>, appRoles: readonly string[]) =>
  inOrganization(member.organizationId, () => adapter.update<MemberRow>({ model: 'member', where: [{ field: 'id', value: member.id }], update: { appRoles: [...appRoles] } }))
