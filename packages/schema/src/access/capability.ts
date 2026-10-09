export type CapabilityAction = 'read' | 'create' | 'update' | 'delete'
export type CapabilityScope = 'own' | 'team'

/**
 * `<resource|area>.<action>[.<scope>]` with `*` wildcards, or `*` alone. Pass the names as the
 * type parameter of `defineRoles` to make unknown names compile-time errors.
 */
export type Capability<Name extends string = string> =
  | '*'
  | `${Name | '*'}.${CapabilityAction | '*'}`
  | `${Name | '*'}.${CapabilityAction | '*'}.${CapabilityScope | '*'}`

export type Grant = 'all' | CapabilityScope

const pattern = /^(\*|[A-Za-z][A-Za-z0-9_]*)\.(\*|read|create|update|delete)(?:\.(\*|own|team))?$/

export type ParsedCapability = { name: string; action: string; scope?: string }

/** Parses and validates a capability string; throws on anything that is not one. */
export const parseCapability = (capability: string): ParsedCapability => {
  if (capability === '*') return { name: '*', action: '*' }
  const match = pattern.exec(capability)
  if (!match) {
    throw new Error(`Invalid capability "${capability}": expected <resource|area>.<read|create|update|delete|*>[.<own|team|*>] or "*"`)
  }
  return { name: match[1]!, action: match[2]!, scope: match[3] }
}

const matches = (pattern: string, value: string) => pattern === '*' || pattern === value

/**
 * The scopes with which `held` grants `wanted`'s resource and action. An unscoped (or `.*`)
 * capability grants everything; `.own` and `.team` narrow to rows.
 */
export const grantsOf = (held: string, wanted: ParsedCapability): Grant[] => {
  const have = parseCapability(held)
  if (!matches(have.name, wanted.name) && wanted.name !== '*') return []
  if (!matches(have.action, wanted.action) && wanted.action !== '*') return []
  if (have.scope === undefined || have.scope === '*') return ['all']
  return [have.scope as Grant]
}
