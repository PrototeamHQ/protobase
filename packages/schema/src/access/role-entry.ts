import { parseFilter } from '../filter'
import type { FilterExpr } from '../model'
import { parseCapability, type Capability } from './capability'

/**
 * What a capability is limited to: the fields it allows, an allowlist (`['sku', 'price']`), a row filter in AIP-160
 * text that is ANDed into its rows (`{ filter: 'published = true' }`), or both (`{ fields: [...], filter: '...' }`).
 */
export type CapabilityLimit = readonly string[] | { readonly fields?: readonly string[]; readonly filter?: string }

/** One entry of a role: a capability, or capabilities each with its limit, `{ 'products.read': ['sku', 'price'] }`. */
export type RoleEntry<Name extends string = string> = Capability<Name> | { readonly [C in Capability<Name>]?: CapabilityLimit }

/** A capability a role holds, with the fields and rows it is limited to when it has a limit. */
export type HeldCapability = { capability: string; fields?: readonly string[]; filter?: FilterExpr }

/** Requests without a token act as this role, when the project defines it. */
export const anonymousRole = 'anonymous'

const fieldActions = ['read', 'create', 'update']

const parsedFilter = (role: string, capability: string, text: string) => {
  const parsed = parseFilter(text)
  if (!parsed.ok || !parsed.ast) throw new Error(`Role "${role}" limits "${capability}" to an invalid filter "${text}": ${parsed.errors[0]?.message ?? 'empty'}`)
  return parsed.ast
}

// The limit of one capability, checked: fields need one resource and one of the actions that touch fields.
const limited = (role: string, capability: string, limit: CapabilityLimit): HeldCapability => {
  const { name, action } = parseCapability(capability)
  const { fields, filter } = Array.isArray(limit) ? { fields: limit as readonly string[], filter: undefined } : (limit as Exclude<CapabilityLimit, readonly string[]>)
  const unknown = Array.isArray(limit) ? [] : Object.keys(limit).filter((key) => key !== 'fields' && key !== 'filter')
  if (unknown.length > 0) throw new Error(`Role "${role}" limits "${capability}" with "${unknown[0]}"; a limit has \`fields\` and \`filter\``)
  if (fields === undefined && filter === undefined) throw new Error(`Role "${role}" limits "${capability}" to nothing; give \`fields\`, \`filter\` or both, or the plain capability`)
  if (name === '*') throw new Error(`Role "${role}" limits "${capability}" but fields and filters belong to one resource; name it instead of "*"`)
  if (fields !== undefined && !fieldActions.includes(action)) throw new Error(`Role "${role}" lists fields for "${capability}"; fields apply to ${fieldActions.join(', ')}`)
  return { capability, ...(fields !== undefined && { fields: [...fields] }), ...(filter !== undefined && { filter: parsedFilter(role, capability, filter) }) }
}

// Only reading, of fields named one by one: a public role never sees a column nobody chose to show.
const checkAnonymous = (held: readonly HeldCapability[]) => {
  for (const { capability, fields } of held) {
    const { name, action, scope } = parseCapability(capability)
    if (action !== 'read') throw new Error(`The anonymous role may only read, but it grants "${capability}"`)
    if (name === '*') throw new Error(`The anonymous role must name each resource it reads, not "${capability}"`)
    if (scope !== undefined) throw new Error(`The anonymous role grants "${capability}", but an anonymous caller owns no rows`)
    if (!fields) throw new Error(`The anonymous role must list the fields it reads: { '${capability}': ['name', ...] }`)
  }
}

/** A role's entries as the capabilities it holds; throws on anything that is not a capability or a valid limit. */
export const heldCapabilities = (role: string, entries: readonly RoleEntry[]): HeldCapability[] => {
  const held = entries.flatMap((entry) => {
    if (typeof entry === 'string') {
      parseCapability(entry)
      return [{ capability: entry }]
    }
    return Object.entries(entry).map(([capability, limit]) => limited(role, capability, limit as CapabilityLimit))
  })
  if (role === anonymousRole) checkAnonymous(held)
  return held
}
