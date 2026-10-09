import { useQuery } from '@tanstack/react-query'
import type { KeyValue } from '@protobase/schema'
import { encodeKey } from '@protobase/schema'
import type { Stored } from '@protobase/client'
import { useClient } from './api-provider'
import { keys } from './query-keys'

export type LiveRecord = Stored<Record<string, unknown>>

export const useRecord = (resource: string, key: KeyValue | readonly KeyValue[], enabled = true) => {
  const client = useClient()
  const encoded = encodeKey(key)
  return useQuery({ queryKey: keys.record(resource, encoded), enabled, queryFn: (): Promise<LiveRecord> => client.get(resource, key) })
}
