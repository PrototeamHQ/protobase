import { useQueryClient } from '@tanstack/react-query'
import { useCallback } from 'react'
import type { RecordPermissions } from '@protobase/client'
import type { ResourceModel } from '@protobase/schema'
import { encodeKey } from '@protobase/schema/internal'
import { keys } from '../data/query-keys'
import type { LiveRecord } from '../data/use-record'
import { recordKey } from '../live/model-helpers'

/**
 * A record as far as a list row knows it: the fields the row loaded, its ETag and permissions as the list gives them.
 * `row` holds relations as their keys, as `displayRow` splits a loaded row.
 */
export const recordPreview = (model: ResourceModel, row: Record<string, unknown>): LiveRecord => ({
  record: Object.fromEntries(Object.entries(row).filter(([name]) => Object.hasOwn(model.fields, name))),
  etag: typeof row.etag === 'string' ? row.etag : '',
  ...(typeof row.permissions === 'object' && row.permissions !== null && { permissions: row.permissions as RecordPermissions }),
})

/**
 * Keeps what a list row knows of its record for the record's page, which shows it until the record has loaded
 * (`useRecord`), so a record opened from a list shows its fields at once.
 */
export const useSeedRecord = (model: ResourceModel) => {
  const queryClient = useQueryClient()
  return useCallback(
    (row: Record<string, unknown>) => queryClient.setQueryData(keys.recordPreview(model.name, encodeKey(recordKey(model, row))), recordPreview(model, row)),
    [queryClient, model],
  )
}
