import type { RecordPermissions } from '@protobase/client'
import type { ResourceModel } from '@protobase/schema'
import type { GridRow } from '../../data-grid'
import { displayRow } from '../displays/list-displays'
import type { LayoutRecord } from '../pages/record-scope'

/**
 * A list's row as the record a named action acts on: its fields as the API gives them, without what the list loads
 * beside them, with its key, ETag and permissions.
 */
export const rowRecord = (model: ResourceModel, row: GridRow): LayoutRecord => ({
  model,
  record: Object.fromEntries(Object.entries(displayRow(model, row).record).filter(([name]) => Object.hasOwn(model.fields, name))),
  key: row.id,
  ...(typeof row.etag === 'string' && { etag: row.etag }),
  ...(typeof row.permissions === 'object' && row.permissions !== null && { permissions: row.permissions as RecordPermissions }),
})
