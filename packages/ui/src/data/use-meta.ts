import { useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query'
import { useContext, useMemo } from 'react'
import { useClient } from './api-provider'
import { MetaContext } from './meta-context'
import type { MetaData } from './meta-data'
import { keys } from './query-keys'

/**
 * The resource and view models. Refetches on window focus with `If-None-Match`, so an unchanged
 * `/meta` costs a 304, and the cached object keeps its identity. Below the app's `MetaGate`, `data` holds the resources
 * of its sources too, as every page of the app reads them.
 */
export const useMeta = (): UseQueryResult<MetaData> => {
  const client = useClient()
  const queryClient = useQueryClient()
  const merged = useContext(MetaContext)
  const query = useQuery({
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
        ...(result.meta.signIn && { signIn: Object.fromEntries(result.meta.signIn.map((entry) => [entry.resource, entry])) }),
        ...(result.meta.bottomBar && { bottomBar: result.meta.bottomBar }),
        ...(result.meta.assistant && { assistant: result.meta.assistant }),
        ...(result.meta.runtime && { runtime: result.meta.runtime }),
        ...(result.meta.errorReporting && { errorReporting: result.meta.errorReporting }),
        ...(result.meta.maps && { maps: result.meta.maps }),
        ...(result.meta.files && { files: result.meta.files }),
        ...(result.meta.plugins && { plugins: result.meta.plugins }),
        // The sources' own `/meta` is read below `MetaGate` (see `withSources`).
        ...(result.meta.sources && { sources: result.meta.sources.map((source) => ({ source, state: 'loading' as const })) }),
      }
    },
  })
  return useMemo(() => (merged && query.data ? ({ ...query, data: merged } as UseQueryResult<MetaData>) : query), [merged, query])
}
