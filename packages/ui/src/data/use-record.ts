import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { KeyValue } from '@protobase/schema'
import { encodeKey } from '@protobase/schema/internal'
import type { Stored } from '@protobase/client'
import { useClient } from './api-provider'
import { keys } from './query-keys'

export type LiveRecord = Stored<Record<string, unknown>>

export const useRecord = (resource: string, key: KeyValue | readonly KeyValue[], enabled = true) => {
  const client = useClient()
  const encoded = encodeKey(key)
  return useQuery({ queryKey: keys.record(resource, encoded), enabled, queryFn: (): Promise<LiveRecord> => client.get(resource, key) })
}

/**
 * `useRecord` for the record's page: until the record has loaded the first time, `data` is what the list row it was
 * opened from knows of it, when it was opened from one, with `isPlaceholderData` set: only the fields the list loaded.
 */
export const useOpenedRecord = (resource: string, key: KeyValue | readonly KeyValue[], enabled = true) => {
  const client = useClient()
  const queryClient = useQueryClient()
  const encoded = encodeKey(key)
  return useQuery({
    queryKey: keys.record(resource, encoded),
    enabled,
    queryFn: (): Promise<LiveRecord> => client.get(resource, key),
    placeholderData: () => queryClient.getQueryData<LiveRecord>(keys.recordPreview(resource, encoded)),
  })
}
