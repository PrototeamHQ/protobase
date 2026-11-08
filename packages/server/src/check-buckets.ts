import { checkFilter, fieldsUsedBy, type CheckedFilter, type ResourceModel, type RoleEntry } from '@protobase/schema'
import { grantsOf, heldCapabilities } from '@protobase/schema/internal'
import { trusted } from './request-access'
import type { Registry } from './registry'

// A search reads the resource's search fields, which `fieldsUsedBy` leaves out.
const searches = (filter: CheckedFilter): boolean => {
  if (filter.kind === 'search') return true
  if (filter.kind === 'and' || filter.kind === 'or') return filter.args.some(searches)
  return filter.kind === 'not' && searches(filter.arg)
}

// The roles as `defineRoles` took them, which it has checked.
type RoleDefinitions = Record<string, unknown>

// What a role's read of the source keeps to that a bucket cannot: its owner's rows, or a filter on another field.
const roleProblems = (source: ResourceModel, by: readonly string[], roles: RoleDefinitions) =>
  Object.entries(roles).flatMap(([role, entries]) =>
    heldCapabilities(role, entries as readonly RoleEntry[]).flatMap(({ capability, filter }) => {
      const grants = grantsOf(capability, { name: source.name, action: 'read' })
      if (grants.length === 0) return []
      const scoped = grants.some((grant) => grant !== 'all') && !(source.owner !== undefined && by.includes(source.owner))
      const checked = filter && checkFilter(trusted(source), filter)
      const outside = checked?.ok ? searches(checked.filter) || fieldsUsedBy(checked.filter).some((field) => !by.includes(field)) : false
      return [
        ...(scoped ? [`role "${role}" reads only its own or its team's ${source.name} with "${capability}", but the rollup does not group by their owner`] : []),
        ...(outside ? [`role "${role}" reads only the ${source.name} its filter keeps with "${capability}", which reads fields the rollup does not group by`] : []),
      ]
    }),
  )

/**
 * Stops startup on a time rollup whose source is not a resource, or whose source's readers some role limits to rows a
 * bucket mixes with others: with `.own` or `.team` while the rollup does not group by the owner, or with a filter on
 * fields it does not group by. A bucket counts every record of its groups, so such a role would read the others'
 * records in the rollup. The rollup's own access rules decide who reads it.
 */
export const checkBuckets = (registry: Registry, roles: RoleDefinitions | undefined) => {
  for (const { model } of registry.entries) {
    if (!model.buckets) continue
    const source = registry.find(model.buckets.from)?.model
    if (!source) throw new Error(`Resource "${model.name}" is a time rollup of "${model.buckets.from}", which is not a resource`)
    const problems = roles ? roleProblems(source, model.buckets.by, roles) : []
    if (problems.length > 0) throw new Error(`Resource "${model.name}" is a time rollup of "${source.name}", whose reads it cannot keep to: ${problems.join('; ')}. Group by those fields, or roll up another resource`)
  }
}
