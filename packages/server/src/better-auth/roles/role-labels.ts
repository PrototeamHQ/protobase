import { membershipRoles, type RoleDefinitions } from '../organizations/role-definitions'

/** Every role with its label, `membership` for those a member can hold, and the roles each one's holders may also give. */
export const roleLabels = (definitions: RoleDefinitions) => {
  const membership = membershipRoles(definitions)
  return definitions.names.map((name) => ({ name, label: definitions.labels[name] ?? name, membership: membership.includes(name), grants: definitions.grants[name] ?? [] }))
}
