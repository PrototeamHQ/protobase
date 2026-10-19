import type { Registry } from './registry'
import { filterErrors, matchErrors } from './view-related'

/**
 * Stops startup on a `.position(..., { after })` that cannot find the records each record ranks after: a join resource
 * the app does not have, `field` and `key` that are no filterable relations to the ranked resource, or a `filter` or
 * `while` that does not fit the join or the ranked resource.
 */
export const checkPositionAfter = (registry: Registry) => {
  const problems = registry.entries.flatMap(({ name, model }) => {
    const after = model.position?.after
    if (!after) return []
    const via = registry.find(after.resource)?.model
    const errors = via
      ? [
          ...matchErrors(via, after.field, name),
          ...matchErrors(via, after.key, name),
          ...filterErrors(via, after.filter).map((error) => `filter: ${error}`),
          ...filterErrors(model, after.while).map((error) => `while: ${error}`),
        ]
      : [`unknown resource "${after.resource}"`]
    return errors.map((error) => `${name} position after: ${error}`)
  })
  if (problems.length > 0) throw new Error(`The positions cannot find the records they rank after:\n${problems.map((problem) => `  - ${problem}`).join('\n')}`)
}
