import type { ResourceModel } from '@protobase/schema'
import { encodeKey } from '@protobase/schema/internal'
import { recordKey } from '../../live/model-helpers'
import type { DropRule } from '../hand-order/drop-rule'
import { text } from './messages'
import type { RankBounds } from './rank-bounds'

/**
 * The drop rule of a list that holds every record in rank order: the record titled `title` lands below each record it
 * depends on and above each that depends on it, by `bounds`; records the list does not hold do not count.
 */
export const dependencyRule = (model: ResourceModel, bounds: RankBounds, title: string): DropRule => ({ order, index }) => {
  const at = (key: string) => order.findIndex((entry) => encodeKey(recordKey(model, entry)) === key)
  const above = bounds.after.find((bound) => at(bound.key) > index)
  if (above) return text('dependsOn', title, above.title)
  const below = bounds.before.find((bound) => at(bound.key) !== -1 && at(bound.key) < index)
  return below ? text('dependsOn', below.title, title) : undefined
}
