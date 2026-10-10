import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useClient } from './api-provider'
import type { MetaData } from './meta-data'
import { keys } from './query-keys'

/**
 * The resource and view models. Refetches on window focus with `If-None-Match`, so an unchanged
 * `/meta` costs a 304, and the cached object keeps its identity.
 */
export const useMeta = () => {
  const client = useClient()
  const queryClient = useQueryClient()
  return useQuery({
    queryKey: keys.meta,
    staleTime: 0,
    refetchOnWindowFocus: 'always',
    queryFn: async (): Promise<MetaData> => {
      const previous = queryClient.getQueryData<MetaData>(keys.meta)
      const result = await client.meta(previous?.etag)
      if (result.status === 'unchanged') {
        if (!previous) throw new Error('The server answered 304 to a request without If-None-Match')
        return previous
      }
      return {
        etag: result.etag,
        resources: Object.fromEntries(result.meta.resources.map((model) => [model.name, model])),
        views: Object.fromEntries(result.meta.views.map((model) => [model.resource, model])),
        pages: Object.fromEntries((result.meta.pages ?? []).map((model) => [model.name, model])),
        permissions: result.meta.permissions ?? {},
        ...(result.meta.userMenu && { userMenu: result.meta.userMenu }),
        ...(result.meta.assistant && { assistant: result.meta.assistant }),
        ...(result.meta.runtime && { runtime: result.meta.runtime }),
      }
    },
  })
}
