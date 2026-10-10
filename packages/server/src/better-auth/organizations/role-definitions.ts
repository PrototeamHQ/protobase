/** A role: its label, or its label and the other roles its holders may also give (see `grantableRoles`). */
export type RoleDefinition = string | { label: string; grants?: string[] }

/** The roles of an app: names only, or each with its definition. */
export type RolesInput = string[] | Record<string, RoleDefinition>

export type RoleDefinitions = {
  /** `admin` first, then the others in the order given. */
  names: string[]
  labels: Record<string, string>
  grants: Record<string, string[]>
}

const roleName = /^[a-z][a-z0-9_-]*$/

/** The superuser: holds every role in every organization. */
export const superuserRole = 'admin'

/** The admin plugin's role for an account without a global role; in organization mode it grants nothing. */
export const noGlobalRole = 'user'

// Better Auth's organization roles; an app role with one of these names would read as one.
const organizationRoleNames = ['owner', 'member']

const builtInLabels: Record<string, string> = { [superuserRole]: 'Superuser', [noGlobalRole]: 'No global role' }

const entriesOf = (input: RolesInput): [string, RoleDefinition | undefined][] =>
  Array.isArray(input) ? input.map((name) => [name, undefined]) : Object.entries(input)

/**
 * The roles with `admin` first (added when missing), their labels and grants. With `organizations`, every role needs a
 * label (`admin` and `user` have one built in), `user` is always there, as the role of an account without a global
 * role, and `owner` and `member` are refused, since they name organization roles.
 */
export const roleDefinitions = (input: RolesInput = ['admin', 'user'], { organizations = false } = {}): RoleDefinitions => {
  const entries = entriesOf(input)
  const bad = entries.find(([name]) => !roleName.test(name))
  if (bad) throw new Error(`Invalid role "${bad[0]}": use lowercase letters, digits, "_" or "-"`)
  const given = new Map(entries)
  const names = [superuserRole, ...new Set(entries.map(([name]) => name).filter((name) => name !== superuserRole)), ...(organizations && !given.has(noGlobalRole) ? [noGlobalRole] : [])]
  const labels: Record<string, string> = {}
  const grants: Record<string, string[]> = {}
  for (const name of names) {
    const definition = given.get(name)
    const label = typeof definition === 'string' ? definition : (definition?.label ?? builtInLabels[name])
    if (label !== undefined) labels[name] = label
    grants[name] = typeof definition === 'object' ? (definition.grants ?? []) : []
    const unknown = grants[name].find((granted) => !names.includes(granted))
    if (unknown !== undefined) throw new Error(`Role "${name}" grants "${unknown}", which is not one of the roles: ${names.join(', ')}`)
  }
  if (!organizations) return { names, labels, grants }
  const reserved = names.find((name) => organizationRoleNames.includes(name))
  if (reserved) throw new Error(`Role "${reserved}" names an organization role; choose another name`)
  const unlabelled = names.find((name) => labels[name] === undefined)
  if (unlabelled) throw new Error(`Role "${unlabelled}" needs a label: with organizations, roles are given as { name: 'Label' }`)
  return { names, labels, grants }
}

/** The roles a member of an organization can hold there: every role but the superuser's and the placeholder. */
export const membershipRoles = ({ names }: RoleDefinitions) => names.filter((name) => name !== superuserRole && name !== noGlobalRole)
