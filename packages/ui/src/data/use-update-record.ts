import { useMutation, useQueryClient } from '@tanstack/react-query'
import { encodeKey, type KeyValue } from '@protobase/schema'
import { PreconditionFailedError } from '@protobase/client'
import { useClient } from './api-provider'
import { keys } from './query-keys'
import type { LiveRecord } from './use-record'

export type UpdateArgs = { patch: Record<string, unknown>; etag: string }

/**
 * PATCH with `If-Match`. On success the cached record gets the new ETag and lists refetch;
 * a `412` rejects with `PreconditionFailedError`, which `isConflict` recognises.
 */
export const useUpdateRecord = (resource: string, key: KeyValue | readonly KeyValue[]) => {
  const client = useClient()
  const queryClient = useQueryClient()
  const encoded = encodeKey(key)
  return useMutation({
    mutationFn: ({ patch, etag }: UpdateArgs): Promise<LiveRecord> => client.update(resource, key, patch, etag),
    onSuccess: (stored) => {
      queryClient.setQueryData(keys.record(resource, encoded), stored)
      void queryClient.invalidateQueries({ queryKey: ['page', resource] })
      void queryClient.invalidateQueries({ queryKey: ['list', resource] })
    },
  })
}

export const isConflict = (error: unknown) => error instanceof PreconditionFailedError
