import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback } from 'react'
import type { Client, RecordPermissions } from '@protobase/client'
import { encodeKey, type ResourceModel } from '@protobase/schema'
import { useClient } from '../../data/api-provider'
import { keys } from '../../data/query-keys'
import { recordKey } from '../../live/model-helpers'
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

export const useCount = (model: ResourceModel, filter = '') => useQuery(countQuery(useClient(), model, filter))

/** The record a RecordCard shows: the one `recordKey` names, or the first that matches `filter` in `sort` order. */
export const useFirstRecord = (model: ResourceModel, { filter = '', sort = '', key }: { filter?: string; sort?: string; key?: string }) => {
  const client = useClient()
  return useQuery({
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
export const useListPage = (model: ResourceModel, { filter = '', sort = '', pageSize, pageToken = '' }: { filter?: string; sort?: string; pageSize: number; pageToken?: string }) => {
  const client = useClient()
  return useQuery({
    queryKey: keys.list(model.name, filter, sort, pageSize, pageToken),
    placeholderData: keepPreviousData,
    queryFn: () => client.list(model.name, { filter: filter || undefined, orderBy: sort || undefined, pageSize, pageToken: pageToken || undefined }),
  })
}

/** Refetches everything shown of a resource after a write: lists, counts, records and labels. */
export const useRefreshResource = () => {
  const queryClient = useQueryClient()
  return useCallback((resource: string) => queryClient.invalidateQueries({ predicate: (query) => query.queryKey[1] === resource }), [queryClient])
}
