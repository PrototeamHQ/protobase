import { parseCondition } from '@protobase/layout'
import type { ResourceModel, ViewModel } from '@protobase/schema'
import { actionConditionError } from '@protobase/schema/internal'

/** The fields an action's `when` reads, or none when it has none or does not parse, which startup refuses. */
export const actionWhenFields = (when: string | undefined) => {
  if (when === undefined) return []
  const parsed = parseCondition(when)
  return parsed.ok ? parsed.paths : []
}

/**
 * An action's `when` parses and reads only fields the record has: a list decides it for every row from the row alone,
 * so it follows no relation and counts no records. A view written as data is checked as the builder checks its options.
 */
export const actionWhenErrors = (view: ViewModel, model: ResourceModel) =>
  view.actions.flatMap((action) => {
    const option = actionConditionError(action)
    if (option) return [`action "${action.name}": ${option}`]
    if (action.when === undefined) return []
    const parsed = parseCondition(action.when)
    if (!parsed.ok) return [`action "${action.name}": "when" is not a valid condition: ${parsed.message}`]
    return parsed.paths
      .filter((path) => !Object.hasOwn(model.fields, path))
      .map((path) => `action "${action.name}": "when" names "${path}", but an action's condition reads only fields ${model.name} has`)
  })
