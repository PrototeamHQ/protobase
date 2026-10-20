import { evaluateCondition, parseCondition } from '@protobase/layout'
import type { ActionModel } from '@protobase/schema'

/**
 * Whether `action` applies to `record`: always without a `when`, else when its condition holds for the record's own
 * fields. With a `when` there is nothing to apply to without a record, and a condition that does not parse never holds.
 */
export const actionApplies = (action: ActionModel, record: Record<string, unknown> | undefined) => {
  if (action.when === undefined) return true
  if (!record) return false
  const condition = parseCondition(action.when)
  return condition.ok && evaluateCondition(condition, record)
}
