import { createWhere, printFilter, type AppAddress, type ResourceModel, type ViewModel } from '@protobase/schema'
import { humanize } from '../../live/naming'

const where = createWhere()

/** What a delete other records still point at says, such as "Orders still point at this company." */
export const blockedDeleteText = ({ blockingPlural, noun }: { blockingPlural: string; noun: string }) => `${blockingPlural} still point at this ${noun.toLowerCase()}.`

export type BlockedDeleteInput = {
  /** What the server says still points at the record (`ApiError.blockedBy`). */
  blockedBy: { resource: string; field?: string }
  resources: Record<string, ResourceModel>
  views: Record<string, ViewModel>
  /** The deleted resource's singular name. */
  noun: string
  /** The record's key, when it is a single value its relation can be filtered by. */
  key?: string
}

/**
 * Why the delete was refused, naming the records that point at it by their view's plural, and, when the server names
 * the field pointing at it, a link to their list filtered to those records. `undefined` for a resource the app does not show.
 */
export const blockedDelete = ({ blockedBy, resources, views, noun, key }: BlockedDeleteInput) => {
  const { resource, field } = blockedBy
  if (!resources[resource]) return undefined
  const plural = views[resource]?.names?.plural ?? humanize(resource)
  const text = blockedDeleteText({ blockingPlural: plural, noun })
  if (!field || key === undefined) return { text }
  const list: AppAddress = { kind: 'list', resource, filter: printFilter(where.eq(field, key)) }
  return { text, link: { label: `Show ${plural.toLowerCase()}`, to: list } }
}
