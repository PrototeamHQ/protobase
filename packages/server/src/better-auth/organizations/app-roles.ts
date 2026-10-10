import { parseRoles } from '../parse-roles'
import { membershipRoles, noGlobalRole, superuserRole, type RoleDefinitions } from './role-definitions'

/** A user's global roles, from the admin plugin's `role` column; the placeholder `user` is none. */
export const globalRoles = (role: string | string[] | null | undefined) => parseRoles(role).filter((name) => name !== noGlobalRole)

/** App roles stored on a membership or an invitation: a JSON array, as the store returns it or as text. */
export const parseAppRoles = (value: unknown): string[] => {
  const list = typeof value === 'string' ? (JSON.parse(value) as unknown) : value
  return Array.isArray(list) ? list.filter((name): name is string => typeof name === 'string') : []
}

/** The roles a request has: the global ones, then the membership's in the active organization, each once. */
export const effectiveRoles = (global: readonly string[], membership: readonly string[] = []) => [...new Set([...global, ...membership])]

/**
 * The roles someone may give or take away: those they hold, globally or in the organization, and those a held role
 * lists in its `grants`. Grants do not chain. A superuser may give every role.
 */
export const grantableRoles = (held: readonly string[], definitions: RoleDefinitions) => {
  if (held.includes(superuserRole)) return new Set(definitions.names)
  return new Set([...held, ...held.flatMap((name) => definitions.grants[name] ?? [])])
}

export type AppRoleRefusal = { status: 'BAD_REQUEST' | 'FORBIDDEN'; code: string; message: string }

/**
 * Whether someone holding `held` may change a membership's app roles from `before` to `after`: every role added or
 * removed must be grantable by them, and every role in `after` one a member can hold. `undefined` when allowed.
 */
export const checkAppRoleChange = (input: { held: readonly string[]; before: readonly string[]; after: readonly string[]; definitions: RoleDefinitions }): AppRoleRefusal | undefined => {
  const allowed = membershipRoles(input.definitions)
  const unknown = input.after.filter((name) => !allowed.includes(name))
  if (unknown.length > 0) {
    return { status: 'BAD_REQUEST', code: 'UNKNOWN_APP_ROLE', message: `A member cannot hold ${unknown.join(', ')}; choose from ${allowed.join(', ')}` }
  }
  const grantable = grantableRoles(input.held, input.definitions)
  const changed = [...input.after.filter((name) => !input.before.includes(name)), ...input.before.filter((name) => !input.after.includes(name))]
  const refused = changed.filter((name) => !grantable.has(name))
  if (refused.length === 0) return undefined
  const labels = refused.map((name) => input.definitions.labels[name] ?? name)
  return { status: 'FORBIDDEN', code: 'APP_ROLE_NOT_GRANTABLE', message: `You cannot give or take away ${labels.join(', ')}: hold the role, or one that grants it` }
}
