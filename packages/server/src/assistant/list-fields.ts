import type { ResourceModel, ViewModel } from '@protobase/schema'
import { listColumnNames } from '@protobase/schema/internal'

/** Asks a read for every field the caller may read, as an AIP-157 read mask does. */
export const everyField = '*'

/**
 * The fields `list_records` returns when it is not told which: the key, then the columns of the resource's table as
 * the caller's view lists them, leaving out the related columns, which are not fields.
 */
export const listFields = (model: ResourceModel, view: ViewModel | undefined) =>
  [...new Set([...model.primaryKey, ...listColumnNames(model, view)])].filter((name) => Object.hasOwn(model.fields, name) && !model.fields[name]!.writeOnly)
