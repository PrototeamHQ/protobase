import { parseRoles } from './parse-roles'

export type AdminCandidate = { id: string; role?: string | string[] | null; banned?: boolean | null }

/** Holds the admin role and is not blocked: the last of these can never be demoted, blocked or removed. */
export const isActiveAdmin = (user: AdminCandidate) => parseRoles(user.role).includes('admin') && !user.banned

/** A change to one user: new roles, blocked or not, or removed; a field left out stays as it is. */
export type AdminChange = { userId: string; roles?: string[]; banned?: boolean; removed?: boolean }

/** Whether `change` would leave `users` without an active admin, while they have one now. */
export const wouldLeaveNoAdmin = (users: AdminCandidate[], change: AdminChange) => {
  const target = users.find((user) => user.id === change.userId)
  if (!target || !isActiveAdmin(target)) return false
  if (change.removed) return users.filter(isActiveAdmin).length <= 1
  const after = { ...target, ...(change.roles && { role: change.roles }), ...(change.banned !== undefined && { banned: change.banned }) }
  return !isActiveAdmin(after) && users.filter(isActiveAdmin).length <= 1
}
