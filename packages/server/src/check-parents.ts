import type { Registry } from './registry'

/**
 * Stops startup on a `.parent()` whose relation cannot find the parent record: a resource the app does not have, or one
 * whose key is not exactly one field, the relation's one column.
 */
export const checkParents = (registry: Registry) => {
  const problems = registry.entries.flatMap(({ name, model }) => (model.parents ?? []).flatMap(({ field }) => {
    const resource = model.fields[field]!.relation!.resource
    const parent = registry.find(resource)?.model
    if (!parent) return [`${name} parent "${field}": unknown resource "${resource}"`]
    return parent.primaryKey.length === 1 ? [] : [`${name} parent "${field}": "${resource}" has a key of ${parent.primaryKey.length} fields, not one`]
  }))
  if (problems.length > 0) throw new Error(`The parents cannot find the records they point at:\n${problems.map((problem) => `  - ${problem}`).join('\n')}`)
}

/**
 * The resources whose lists would read across tenants (`tenantAcross`) but keep to the parents the caller reads, which
 * are resolved in the caller's own tenant only: they list that tenant alone.
 */
export const parentWarnings = (registry: Registry) =>
  registry.entries
    .filter(({ model }) => model.tenantAcross && model.parents?.some((parent) => parent.access === 'read'))
    .map(({ name }) => `"${name}" keeps to the parents its readers read (.parent(..., 'read')), so its lists read the caller's own tenant only: tenantAcross is ignored`)
