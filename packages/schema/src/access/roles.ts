import type { FilterExpr } from '../model'
import { andResults, orResults, where } from './combine'
import { grantsOf, parseCapability, type Capability, type Grant } from './capability'
import { heldCapabilities, type HeldCapability, type RoleEntry } from './role-entry'
import { rule, type Rule } from './rule'
import type { AccessContext, AccessUser } from './types'

/** The second argument of `defineRoles`. */
export type RolesOptions = {
  /** Ids of the users in `user`'s team; `.team` scopes become `owner IN teamOf(user)`. */
  teamOf?: (user: AccessUser) => readonly (string | number)[] | Promise<readonly (string | number)[]>
  /** Resource and area names; when given, unknown names in capabilities throw at definition. */
  names?: readonly string[]
}

/** A capability of a role that is limited to fields or rows; the server checks them against the resources at startup. */
export type RoleLimit = HeldCapability & {
  /** The role holding it. */
  role: string
}

const rolesOf = (user: AccessUser) => user.roles ?? []

/**
 * Defines roles as bundles of capability strings. Pass the resource and area names as the type
 * parameter to reject unknown names at compile time:
 * `defineRoles<'orders' | 'costs'>({ sales: ['orders.read.own'] })`.
 *
 * An entry may limit capabilities to fields (an allowlist) and rows (an AIP-160 filter):
 * `{ 'products.read': ['sku', 'price'] }`, `{ 'products.read': { fields: ['name'], filter: 'published = true' } }`.
 * The role `anonymous`, when defined, is what requests without a token act as; it may only read listed fields.
 * See [Access](website/src/content/docs/reference/access.mdx#capabilities).
 *
 * @example
 * ```ts
 * const roles = defineRoles<'orders' | 'products'>({
 *   admin: ['*'],
 *   sales: ['orders.read.own', 'orders.create', 'products.read'],
 *   reseller: [{ 'products.read': { fields: ['sku', 'name', 'price'], filter: 'published = true' } }],
 * })
 * ```
 */
export const defineRoles = <Name extends string = string>(
  definitions: Record<string, readonly RoleEntry<Name>[]>,
  options: RolesOptions = {},
) => {
  const held = new Map(Object.entries(definitions).map(([role, entries]) => [role, heldCapabilities(role, entries)]))
  for (const [role, capabilities] of held) {
    for (const { capability } of capabilities) {
      const { name } = parseCapability(capability)
      if (options.names && name !== '*' && !options.names.includes(name)) {
        throw new Error(`Role "${role}" grants "${capability}" but "${name}" is not a known resource or area`)
      }
    }
  }

  const heldBy = (user: AccessUser) => rolesOf(user).flatMap((role) => held.get(role) ?? [])

  /** Scopes granted by the user's roles for a capability, without applying them. */
  const grants = (user: AccessUser, capability: string): Set<Grant> => {
    const wanted = parseCapability(capability)
    return new Set(heldBy(user).flatMap((held) => grantsOf(held.capability, wanted)))
  }

  const scoped = async (ctx: AccessContext, scope: 'own' | 'team', capability: string): Promise<FilterExpr | false> => {
    const owner = ctx.model?.owner
    if (!owner) {
      throw new Error(`"${capability}" is scoped to ${scope} rows but ${ctx.model ? `resource "${ctx.model.name}" has no .owner(...)` : 'the access context has no model'}`)
    }
    if (scope === 'own') return ctx.user?.id === undefined ? false : where.eq(owner, ctx.user.id as string)
    if (!options.teamOf) throw new Error(`"${capability}" needs a teamOf resolver in defineRoles options`)
    const ids = await options.teamOf(ctx.user ?? {})
    return ids.length === 0 ? false : where.in(owner, [...ids] as string[])
  }

  return {
    /** The roles as defined, by name. */
    definitions,
    grants,

    /** The capabilities limited to fields or rows, by role. */
    limits: [...held].flatMap(([role, capabilities]) => capabilities.filter((held) => held.fields || held.filter).map((held): RoleLimit => ({ role, ...held }))),

    /** Whether the user holds the capability at all, in any scope. For areas and field rules. */
    has: (user: AccessUser, capability: Capability<Name>) => grants(user, capability).size > 0,

    /**
     * The fields the user's roles allow for a capability: the union of their lists, or `undefined` when a role grants
     * it without a list (every field) or none grants it.
     */
    fields: (user: AccessUser, capability: string): readonly string[] | undefined => {
      const wanted = parseCapability(capability)
      const matching = heldBy(user).filter((held) => grantsOf(held.capability, wanted).length > 0)
      if (matching.length === 0 || matching.some((held) => !held.fields)) return undefined
      return [...new Set(matching.flatMap((held) => held.fields!))]
    },

    /**
     * A rule that allows when the user's roles grant the capability: `true` for an unscoped
     * grant, a row filter for `.own`, `.team` and a limit's filter, `false` otherwise.
     */
    can: (capability: Capability<Name>): Rule => {
      const wanted = parseCapability(capability)
      return rule(async (ctx) => {
        const matching = heldBy(ctx.user ?? {}).flatMap((held) => grantsOf(held.capability, wanted).map((grant) => ({ grant, filter: held.filter })))
        if (matching.some(({ grant, filter }) => grant === 'all' && !filter)) return true
        // Each grant's rows within its entry's filter, ORed; a scope granted twice without a filter counts once.
        const unfiltered = [...new Set(matching.filter(({ filter }) => !filter).map(({ grant }) => grant))].map((grant) => ({ grant, filter: undefined }))
        const filters = await Promise.all([...unfiltered, ...matching.filter(({ filter }) => filter)].map(async ({ grant, filter }) => {
          const rows = grant === 'all' ? true : await scoped(ctx, grant, capability)
          return filter ? andResults(rows, filter) : rows
        }))
        return filters.reduce<boolean | FilterExpr>((result, filter) => orResults(result, filter), false)
      })
    },

    /** A rule that allows when the user has any of the roles. */
    is: (...roles: string[]): Rule => {
      for (const role of roles) {
        if (!Object.hasOwn(definitions, role)) throw new Error(`Unknown role "${role}"`)
      }
      return rule((ctx) => rolesOf(ctx.user ?? {}).some((role) => roles.includes(role)))
    },
  }
}

/** The roles `defineRoles` returns, as the server's `options.roles` takes them. */
export type Roles = ReturnType<typeof defineRoles>
