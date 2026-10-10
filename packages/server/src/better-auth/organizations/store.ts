import type { createAuthMiddleware } from 'better-auth/api'
import { parseAppRoles } from './app-roles'
import type { MembershipSummary } from './active-organization'

// Storage goes through Better Auth's adapter, which maps the models and fields to the store's snake_case names.
// Written against better-auth 1.7.7.

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

export const findMember = async (adapter: Adapter, where: { organizationId: string; userId: string }) => {
  const row = await adapter.findOne<MemberRow>({ model: 'member', where: [{ field: 'organizationId', value: where.organizationId }, { field: 'userId', value: where.userId }] })
  return row ? memberOf(row) : undefined
}

export const findMemberById = async (adapter: Adapter, id: string) => {
  const row = await adapter.findOne<MemberRow>({ model: 'member', where: [{ field: 'id', value: id }] })
  return row ? memberOf(row) : undefined
}

export const membershipsOf = async (adapter: Adapter, userId: string): Promise<StoredMember[]> =>
  (await adapter.findMany<MemberRow>({ model: 'member', where: [{ field: 'userId', value: userId }], limit: everyRow })).map(memberOf)

export const membersOf = async (adapter: Adapter, organizationId: string): Promise<StoredMember[]> =>
  (await adapter.findMany<MemberRow>({ model: 'member', where: [{ field: 'organizationId', value: organizationId }], limit: everyRow })).map(memberOf)

export const findOrganization = (adapter: Adapter, id: string) =>
  adapter.findOne<StoredOrganization>({ model: 'organization', where: [{ field: 'id', value: id }] })

export const summaries = (members: readonly StoredMember[]): MembershipSummary[] => members.map(({ organizationId, createdAt }) => ({ organizationId, createdAt }))

export const setAppRoles = (adapter: Adapter, memberId: string, appRoles: readonly string[]) =>
  adapter.update<MemberRow>({ model: 'member', where: [{ field: 'id', value: memberId }], update: { appRoles: [...appRoles] } })
