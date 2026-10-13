import { useQuery } from '@tanstack/react-query'
import { useClient } from '../../data/api-provider'
import { keys } from '../../data/query-keys'
import { useAdminMeta } from '../meta-gate'
import { defaultOrderBy } from '../list-order'
import { savedPageSize } from '../saved/saved-records'

/** One of the user's saved searches as the list API gives it: its fields, and its ETag to change it with. */
export type SavedSearchRow = Record<string, unknown> & { etag?: string }

/** Where the user's saved searches of `resource` are cached; a list key, so a write to the resource refreshes it. */
export const savedSearchesKey = (resource: string) => keys.list(resource, '', '', savedPageSize, 'saved-searches')

/**
 * The signed-in user's saved searches, in the order of their view's list: every one, page by page, as the API lists only
 * a user's own records of a resource with an owner. Loads only while `enabled`.
 */
export const useSavedSearches = (resource: string, enabled: boolean) => {
  const client = useClient()
  const { resources, views } = useAdminMeta()
  const model = resources[resource]
  return useQuery({
    queryKey: savedSearchesKey(resource),
    enabled: enabled && model !== undefined,
    queryFn: async (): Promise<SavedSearchRow[]> => {
      const rows: SavedSearchRow[] = []
      let pageToken: string | undefined
      do {
        const page = await client.list(resource, { pageSize: savedPageSize, orderBy: defaultOrderBy(model!, views[resource]), ...(pageToken && { pageToken }) })
        rows.push(...(page.items as SavedSearchRow[]))
        pageToken = page.nextPageToken || undefined
      } while (pageToken)
      return rows
    },
  })
}
