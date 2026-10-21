/** The operation a capability grants; `read` covers listing too. */
export type CapabilityAction = 'read' | 'create' | 'update' | 'delete'

/** The rows a scoped capability narrows to: the user's own (`.own`) or their team's (`.team`), by the resource's owner field. */
export type CapabilityScope = 'own' | 'team'

/**
 * `<resource|area>.<action>[.<scope>]` with `*` wildcards, or `*` alone. Pass the names as the
 * type parameter of `defineRoles` to make unknown names compile-time errors.
 */
export type Capability<Name extends string = string> =
  | '*'
  | `${Name | '*'}.${CapabilityAction | '*'}`
  | `${Name | '*'}.${CapabilityAction | '*'}.${CapabilityScope | '*'}`

/**
 * A capability without wildcards, `<resource|area>.<action>[.<scope>]`: what `roles.has` and `roles.can` ask for, since a
 * wildcard there would be granted by any one of the capabilities it stands for.
 */
export type ExactCapability<Name extends string = string> = `${Name}.${CapabilityAction}` | `${Name}.${CapabilityAction}.${CapabilityScope}`

/** The rows a held capability grants: all of them, or those of a scope. */
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

/** Parses a capability that `has` or `can` asks for; throws on a wildcard, which would mean "any of", not "all of". */
export const parseExactCapability = (capability: string): ParsedCapability => {
  const parsed = parseCapability(capability)
  if ([parsed.name, parsed.action, parsed.scope].includes('*')) {
    throw new Error(`"${capability}" has a wildcard, which any one capability it covers would grant: ask for each capability, or use roles.holds(user, "${capability}") to need all of them`)
  }
  return parsed
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

const covers = (held: string | undefined, wanted: string | undefined) => held === '*' || held === wanted

/**
 * Whether `held` grants all of `wanted`: each of its parts is `*` or the same, and a wanted capability without a scope
 * needs one without a scope (or `.*`). So `*` and `vms.*` hold `vms.*`, while `vms.read` or `*.read` do not.
 */
export const holdsAll = (held: string, wanted: string) => {
  const have = parseCapability(held)
  const want = parseCapability(wanted)
  return covers(have.name, want.name) && covers(have.action, want.action) && (have.scope === undefined || covers(have.scope, want.scope))
}
