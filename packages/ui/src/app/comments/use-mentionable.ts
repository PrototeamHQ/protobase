import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useClient } from '../../data/api-provider'
import { keys } from '../../data/query-keys'
import { useDebounced } from '../../lib/use-debounced'

/** The people a comment on the record may mention whose name contains `query`, asked 150 ms after it last changed; none while `query` is `undefined`. */
export const useMentionable = (resource: string, recordKey: string, query: string | undefined) => {
  const client = useClient()
  const settled = useDebounced(query, 150)
  return useQuery({
    queryKey: keys.mentionable(resource, recordKey, settled ?? ''),
    queryFn: () => client.mentionable(resource, recordKey, settled ?? ''),
    enabled: settled !== undefined,
    // The last answer stays up while the next query is on its way, so the list does not flicker as the name is typed
    placeholderData: keepPreviousData,
  })
}
