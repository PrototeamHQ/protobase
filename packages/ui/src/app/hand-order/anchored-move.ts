import type { BatchOp } from '@protobase/client'
import type { ResourceModel } from '@protobase/schema'
import { recordKey } from '../../live/model-helpers'

/**
 * The `move` that saves the record at `index` of `order`, the list as shown once it was dropped: anchored to the record
 * above it and the one below, so it saves while the record after that anchor is still the one below, whatever else
 * changed. `filter` is the list's, so the server reads the same list. With `more` records after `order` not loaded, a
 * record dropped last does not know the one below it, so only its anchor is checked.
 */
export const anchoredMove = (model: ResourceModel, field: string, filter: string, order: Record<string, unknown>[], index: number, more = false): BatchOp => {
  const keyAt = (at: number) => (order[at] ? recordKey(model, order[at]) : null)
  const unknown = more && index === order.length - 1
  return { op: 'move', resource: model.name, field, key: recordKey(model, order[index]!), after: keyAt(index - 1), ...(!unknown && { before: keyAt(index + 1) }), ...(filter && { filter }) }
}
