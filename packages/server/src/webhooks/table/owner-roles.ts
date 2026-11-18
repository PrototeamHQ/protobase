import { sql } from 'kysely'
import type { AdminAuth } from '../../better-auth/create-auth'
import { effectiveRoles, globalRoles, parseAppRoles } from '../../better-auth/organizations/app-roles'
import type { AuthContext } from '../../better-auth/organizations/store'
import { resolveActiveRole } from '../../better-auth/roles/active-role'
import { mayBeId, storedId } from '../../better-auth/store/store-reads'
import { storeSqlOf } from '../../better-auth/store/store-sql'
import { bannedNow } from '../../better-auth/token-standing'
import { parseRoles } from '../../better-auth/users'
import type { TenantValue } from '../../types'

type Owner = { id: string; tenant?: TenantValue }
type UserRow = { id: string; role: string | null; last_role: string | null; banned: boolean | null; banExpires: Date | null }
type MemberRow = { user_id: string; organization_id: string; app_roles: unknown }

const memberKey = (userId: string, organizationId: string) => JSON.stringify([userId, organizationId])

// The roles each owner acts with now, in their order: the users in one read, their memberships of the tenants in another.
const ownersRoles = async (auth: AdminAuth, owners: readonly Owner[]) => {
  const context = (await auth.$context) as unknown as AuthContext
  const store = storeSqlOf(context)
  // Ids as the store gives them back, so the rows it returns are found by them.
  const idOf = (id: string) => storedId(context.options, id)
  const ids = [...new Set(owners.map((owner) => idOf(owner.id)))].filter((id) => mayBeId(context.options, id))
  const { rows: users } = ids.length === 0 ? { rows: [] } : await sql<UserRow>`select id, ${store.userColumn('role')} as role, ${store.userColumn('lastRole')} as last_role,
    ${store.userColumn('banned')} as banned, ${store.userColumn('banExpires')} as "banExpires" from ${store.user} where id = any(${ids})`.execute(store.db)
  const now = new Date()
  const standing = new Map(users.filter((user) => !bannedNow(user, now)).map((user) => [user.id, user]))
  // Without organizations, a tenant holds no roles of its own.
  const tenants = auth.organizations ? [...new Set(owners.flatMap((owner) => (owner.tenant !== undefined && standing.has(idOf(owner.id)) ? [idOf(String(owner.tenant))] : [])))].filter((id) => mayBeId(context.options, id)) : []
  const { rows: members } = tenants.length === 0 ? { rows: [] } : await sql<MemberRow>`select user_id, organization_id, app_roles from ${store.table('member')}
    where user_id = any(${[...standing.keys()]}) and organization_id = any(${tenants})`.execute(store.db)
  const memberships = new Map(members.map((member) => [memberKey(member.user_id, member.organization_id), parseAppRoles(member.app_roles)]))
  return owners.map(({ id, tenant }) => {
    const user = standing.get(idOf(id))
    if (!user) return []
    const global = auth.organizations ? globalRoles(user.role) : parseRoles(user.role)
    const appRoles = tenant === undefined ? undefined : memberships.get(memberKey(user.id, idOf(String(tenant))))
    const active = resolveActiveRole(appRoles ? effectiveRoles(global, appRoles) : global, [user.last_role])
    return active === undefined ? [] : [active]
  })
}

/**
 * The role someone acts with now, as their next session's token would carry it: the one they last chose while they
 * hold it, else their first (see `resolveActiveRole`). None for a user whose ban stands, who is gone, or who holds no role. The
 * calls made together, as for every subscription loaded at once, are answered by one read of the users and one of
 * their memberships.
 */
export const betterAuthOwnerRoles = (auth: AdminAuth) => {
  let waiting: { owner: Owner; answer: (roles: string[]) => void; fail: (error: unknown) => void }[] = []
  return (owner: Owner) =>
    new Promise<string[]>((answer, fail) => {
      waiting.push({ owner, answer, fail })
      if (waiting.length > 1) return
      queueMicrotask(() => {
        const asked = waiting
        waiting = []
        ownersRoles(auth, asked.map((one) => one.owner)).then(
          (roles) => asked.forEach((one, index) => one.answer(roles[index]!)),
          (error: unknown) => asked.forEach((one) => one.fail(error)),
        )
      })
    })
}
