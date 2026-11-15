import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback } from 'react'
import type { Client, RecordPermissions } from '@protobase/client'
import type { ResourceModel } from '@protobase/schema'
import { encodeKey } from '@protobase/schema/internal'
import { useClient } from '../../data/api-provider'
import { keys, readsResource } from '../../data/query-keys'
import { recordKey } from '../../live/model-helpers'
import type { Planned } from './plan-reads'
import type { LayoutRecord } from './record-scope'

type Row = Record<string, unknown>

/** A list item as a record scope: the key as the URL carries it, and the etag and permissions the item carries. */
export const scopeOf = (model: ResourceModel, row: Row): LayoutRecord => ({
  model,
  record: row,
  key: encodeKey(recordKey(model, row)),
  etag: typeof row.etag === 'string' ? row.etag : undefined,
  permissions: row.permissions as RecordPermissions | undefined,
})

/** How many records of `model` match `filter`, counted by the server inside the caller's access rules. */
export const countQuery = (client: Client, model: ResourceModel, filter = '') => ({
  queryKey: keys.count(model.name, filter),
  queryFn: async () => {
    const page = await client.list(model.name, { filter: filter || undefined, pageSize: 1, count: 'exact', fields: model.primaryKey })
    return page.totalSize ?? page.totalSizeEstimate
  },
})

export const useCount = (model: ResourceModel, filter = '', enabled = true) => useQuery({ ...countQuery(useClient(), model, filter), enabled })

/** The record a RecordCard shows: the one `recordKey` names, or the first that matches `filter` in `sort` order. */
export const useFirstRecord = (model: ResourceModel, { filter = '', sort = '', key, enabled = true }: { filter?: string; sort?: string; key?: string; enabled?: boolean }) => {
  const client = useClient()
  return useQuery({
    enabled,
    queryKey: key === undefined ? keys.firstRecord(model.name, filter, sort) : keys.record(model.name, key),
    queryFn: async (): Promise<LayoutRecord | null> => {
      if (key !== undefined) {
        const stored = await client.get(model.name, key)
        return { ...scopeOf(model, stored.record), etag: stored.etag, permissions: stored.permissions }
      }
      const page = await client.list(model.name, { filter: filter || undefined, orderBy: sort || undefined, pageSize: 1 })
      return page.items[0] ? scopeOf(model, page.items[0]) : null
    },
  })
}

/** One page of a list, from `pageToken`; the previous page stays on screen while the next loads. */
export const useListPage = (model: ResourceModel, { filter = '', sort = '', pageSize, pageToken = '', enabled = true }: { filter?: string; sort?: string; pageSize: number; pageToken?: string; enabled?: boolean }) => {
  const client = useClient()
  return useQuery({
    enabled,
    queryKey: keys.list(model.name, filter, sort, pageSize, pageToken),
    placeholderData: keepPreviousData,
    queryFn: () => client.list(model.name, { filter: filter || undefined, orderBy: sort || undefined, pageSize, pageToken: pageToken || undefined }),
  })
}

/** A planned read's first record, as `useFirstRecord` gives it: `null` when it holds none. */
export const plannedRecord = (model: ResourceModel, planned: Planned): { isPending: boolean; error: Error | null; data: LayoutRecord | null | undefined } => ({
  isPending: planned.isPending,
  error: planned.error,
  data: planned.rows[0] ? { ...scopeOf(model, planned.rows[0]), planned: true } : planned.isPending ? undefined : null,
})

/** Refetches everything shown of a resource after a write: lists, counts, records, labels and the page's planned reads. */
export const useRefreshResource = () => {
  const queryClient = useQueryClient()
  return useCallback((resource: string) => queryClient.invalidateQueries({ predicate: (query) => readsResource(query.queryKey, new Set([resource])) }), [queryClient])
}
