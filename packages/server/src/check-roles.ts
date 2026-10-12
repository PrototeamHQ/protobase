import { anonymousRole, checkFilter, type RoleLimit } from '@protobase/schema'
import type { Registry } from './registry'

/**
 * Stops startup on a role's limit that does not fit its resource: fields or a filter for a name that is not a resource,
 * a field it does not have, a filter it cannot check, or an anonymous capability on a tenant-scoped resource, since an
 * anonymous caller works in no organization.
 */
export const checkRoleLimits = (registry: Registry, limits: readonly RoleLimit[]) => {
  for (const { role, capability, fields, filter } of limits) {
    const name = capability.slice(0, capability.indexOf('.'))
    const model = registry.find(name)?.model
    if (!model) throw new Error(`Role "${role}" limits "${capability}" but "${name}" is not a resource`)
    const unknown = fields?.find((field) => !Object.hasOwn(model.fields, field))
    if (unknown) throw new Error(`Role "${role}" lists the field "${unknown}" for "${capability}" but ${name} has no such field`)
    if (role === anonymousRole && model.tenant) throw new Error(`The anonymous role reads ${name}, which is tenant-scoped, but an anonymous caller works in no organization`)
    if (!filter) continue
    // Like an access rule's filter, it may use columns that are not filterable.
    const trusted = { ...model, fields: Object.fromEntries(Object.entries(model.fields).map(([field, value]) => [field, { ...value, filterable: true }])) }
    const checked = checkFilter(trusted, filter)
    if (!checked.ok) throw new Error(`Role "${role}" limits "${capability}" to a filter that does not fit ${name}: ${checked.errors[0]!.message}`)
  }
}
