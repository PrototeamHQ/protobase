import type { FilterExpr } from '../model'
import { orResults, where } from './combine'
import { grantsOf, parseCapability, type Capability, type Grant } from './capability'
import { rule, type Rule } from './rule'
import type { AccessContext, AccessUser } from './types'

export type RolesOptions = {
  /** Ids of the users in `user`'s team; `.team` scopes become `owner IN teamOf(user)`. */
  teamOf?: (user: AccessUser) => readonly (string | number)[] | Promise<readonly (string | number)[]>
  /** Resource and area names; when given, unknown names in capabilities throw at definition. */
  names?: readonly string[]
}

const rolesOf = (user: AccessUser) => user.roles ?? []

/**
 * Defines roles as bundles of capability strings. Pass the resource and area names as the type
 * parameter to reject unknown names at compile time:
 * `defineRoles<'orders' | 'costs'>({ sales: ['orders.read.own'] })`.
 */
export const defineRoles = <Name extends string = string>(
  definitions: Record<string, readonly Capability<Name>[]>,
  options: RolesOptions = {},
) => {
  for (const [role, capabilities] of Object.entries(definitions)) {
    for (const capability of capabilities) {
      const { name } = parseCapability(capability)
      if (options.names && name !== '*' && !options.names.includes(name)) {
        throw new Error(`Role "${role}" grants "${capability}" but "${name}" is not a known resource or area`)
      }
    }
  }

  /** Scopes granted by the user's roles for a capability, without applying them. */
  const grants = (user: AccessUser, capability: string): Set<Grant> => {
    const wanted = parseCapability(capability)
    const held = rolesOf(user).flatMap((role) => definitions[role] ?? [])
    return new Set(held.flatMap((capability) => grantsOf(capability, wanted)))
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
    definitions,
    grants,

    /** Whether the user holds the capability at all, in any scope. For areas and field rules. */
    has: (user: AccessUser, capability: Capability<Name>) => grants(user, capability).size > 0,

    /**
     * A rule that allows when the user's roles grant the capability: `true` for an unscoped
     * grant, a row filter for `.own` and `.team`, `false` otherwise.
     */
    can: (capability: Capability<Name>): Rule => {
      parseCapability(capability)
      return rule(async (ctx) => {
        const held = grants(ctx.user ?? {}, capability)
        if (held.has('all')) return true
        const filters = await Promise.all([...held].map((scope) => scoped(ctx, scope as 'own' | 'team', capability)))
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

export type Roles = ReturnType<typeof defineRoles>
