import type { AuthContext } from './organizations/store'
import { parseRoles } from './parse-roles'
import { activeAdminExists } from './store/active-admin'
import { storeSqlOf } from './store/store-sql'

export type AdminCandidate = { id: string; role?: string | string[] | null; banned?: boolean | null }

/** Holds the admin role and is not blocked: the last of these can never be demoted, blocked or removed. */
export const isActiveAdmin = (user: AdminCandidate) => parseRoles(user.role).includes('admin') && !user.banned

/** A change to one user: new roles, blocked or not, or removed; a field left out stays as it is. */
export type AdminChange = { userId: string; roles?: string[]; banned?: boolean; removed?: boolean }

/** Whether `change` makes `target`, an active admin now, no longer one. */
export const takesAdminAway = (target: AdminCandidate, change: AdminChange) => {
  if (!isActiveAdmin(target)) return false
  if (change.removed) return true
  return !isActiveAdmin({ ...target, ...(change.roles && { role: change.roles }), ...(change.banned !== undefined && { banned: change.banned }) })
}

/**
 * Whether `change` would leave the store without an active admin, while it has one now: the target is read by its id,
 * and Postgres says whether another active admin exists.
 */
export const leavesNoAdmin = async (context: Pick<AuthContext, 'adapter' | 'options' | 'tables'>, change: AdminChange) => {
  const target = await context.adapter.findOne<AdminCandidate>({ model: 'user', where: [{ field: 'id', value: change.userId }], select: ['id', 'role', 'banned'] })
  if (!target || !takesAdminAway(target, change)) return false
  return !(await activeAdminExists(storeSqlOf(context), { except: change.userId }))
}
