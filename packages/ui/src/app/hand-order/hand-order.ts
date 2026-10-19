import type { ResourcePermissions } from '@protobase/client'
import type { RelatedModel, ResourceModel } from '@protobase/schema'
import { can } from '../permissions'

/** The records loaded per request to reorder them by hand, the list API's largest page; all pages load. */
export const handOrderPage = 500

/** The field a user may sort `model`'s records by hand in: its `position`, when they may update it. */
const writablePosition = (model: ResourceModel, permissions: ResourcePermissions) => {
  const position = model.position
  if (!position || !can(permissions, 'update')) return undefined
  const field = model.fields[position.field]
  return field && !field.readOnly ? position.field : undefined
}

/**
 * The field the list page sorts all of `model`'s records by hand in. A resource whose records are ordered within a
 * parent is sorted in the parent's related section instead, since its list mixes the parents.
 */
export const listHandOrder = (model: ResourceModel, permissions: ResourcePermissions) =>
  model.position?.within === undefined ? writablePosition(model, permissions) : undefined

/**
 * The field a related section sorts its records by hand in: those of one parent, when the section lists every record
 * whose `within` relation points at the page's record, no filter or join resource leaving some out.
 */
export const relatedHandOrder = (item: RelatedModel, model: ResourceModel, permissions: ResourcePermissions) =>
  model.position?.within !== undefined && item.field === model.position.within && !item.through && !item.from && !item.filter ? writablePosition(model, permissions) : undefined
