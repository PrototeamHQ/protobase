import { keepPreviousData, useQuery } from '@tanstack/react-query'
import type { Client } from '@protobase/client'
import type { ResourceModel } from '@protobase/schema'
import { useClient } from '../../../../data/api-provider'
import { keys } from '../../../../data/query-keys'

// The list API's largest page
const pageSize = 500

type Row = Record<string, unknown>

export type TimelineRowsRequest = { filter?: string; sort: string; fields: string[]; limit: number }

/** A timeline's records, as many as `limit`, and whether more match than that. */
export type TimelineRows = { rows: Row[]; cut: boolean }

/**
 * Every record that matches `filter`, page after page in `sort` order up to `limit`, then the earliest first; `cut`
 * when more remain. It reads only the fields the timeline draws, and no ETags.
 */
export const timelineRowsQuery = (client: Client, model: ResourceModel, { filter = '', sort, fields, limit }: TimelineRowsRequest) => ({
  queryKey: [...keys.list(model.name, filter, sort, limit, 'timeline'), fields.join(',')],
  queryFn: async (): Promise<TimelineRows> => {
    const rows: Row[] = []
    let pageToken: string | undefined
    do {
      const page = await client.list(model.name, { filter: filter || undefined, orderBy: sort, pageSize: Math.min(pageSize, limit - rows.length), fields, etag: false, ...(pageToken && { pageToken }) })
      rows.push(...(page.items as Row[]))
      pageToken = page.nextPageToken || undefined
    } while (pageToken && rows.length < limit)
    return { rows: rows.toReversed(), cut: pageToken !== undefined }
  },
})

/** A timeline's records, as `timelineRowsQuery` reads them; the records before stay on screen while newer ones load. */
export const useTimelineRows = (model: ResourceModel, { enabled = true, ...request }: TimelineRowsRequest & { enabled?: boolean }) =>
  useQuery({ ...timelineRowsQuery(useClient(), model, request), enabled, placeholderData: keepPreviousData })
