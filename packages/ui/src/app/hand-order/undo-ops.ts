import type { BatchOp } from '@protobase/client'
import type { ResourceModel } from '@protobase/schema'
import { recordKey } from '../../live/model-helpers'

/** A record a drag saved: its values before the drag, and the record and ETag the server gave back. */
export type DragWrite = { before: Record<string, unknown>; record: Record<string, unknown>; etag: string }

/**
 * The batch that undoes a drag: an update of each record it saved putting back those of `fields` it changed, with the
 * ETag the save gave it, so a record changed again since is refused rather than overwritten.
 */
export const undoOps = (model: ResourceModel, writes: DragWrite[], fields: string[]): BatchOp[] =>
  writes.flatMap(({ before, record, etag }) => {
    const changed = fields.filter((field) => Object.hasOwn(before, field) && before[field] !== record[field])
    if (changed.length === 0) return []
    return [{ op: 'update', resource: model.name, key: recordKey(model, record), data: Object.fromEntries(changed.map((field) => [field, before[field]])), etag }]
  })
