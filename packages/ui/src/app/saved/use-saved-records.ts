import { useQuery } from '@tanstack/react-query'
import { useClient } from '../../data/api-provider'
import { keys } from '../../data/query-keys'
import { useAdminMeta } from '../meta-gate'
import { savedPageSize, savedRecordsOf, type SavedRecord } from './saved-records'

/** Where the user's saved records of `resource` by `field` are cached; a list key, so a write to the resource refreshes it. */
export const savedRecordsKey = (resource: string, field: string) => keys.list(resource, '', '', savedPageSize, `saved:${field}`)

/**
 * The signed-in user's saved records of `resource`, each with the key its relation `field` points at: every one, page
 * by page, as the API lists only a user's own records of a resource with an owner. Loads only while `enabled`.
 */
export const useSavedRecords = (resource: string, field: string, enabled: boolean) => {
  const client = useClient()
  const model = useAdminMeta().resources[resource]
  return useQuery({
    queryKey: savedRecordsKey(resource, field),
    enabled: enabled && model !== undefined,
    queryFn: async (): Promise<SavedRecord[]> => {
      const rows: Record<string, unknown>[] = []
      let pageToken: string | undefined
      do {
        const page = await client.list(resource, { pageSize: savedPageSize, fields: [...model!.primaryKey, field], ...(pageToken && { pageToken }) })
        rows.push(...(page.items as Record<string, unknown>[]))
        pageToken = page.nextPageToken || undefined
      } while (pageToken)
      return savedRecordsOf(model!, field, rows)
    },
  })
}
