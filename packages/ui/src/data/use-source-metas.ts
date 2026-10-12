import { useQueries, useQueryClient, type UseQueryResult } from '@tanstack/react-query'
import { useMemo } from 'react'
import { sourceMeta, type Client, type SourceMeta, type SourceRef } from '@protobase/client'
import { keys } from './query-keys'

/** A source's `/meta` as far as it has loaded: the part the app draws once it is `ready`. */
export type SourceResult = { source: SourceRef; state: 'loading' } | { source: SourceRef; state: 'ready'; meta: SourceMeta } | { source: SourceRef; state: 'error'; error: Error }

type Loaded = { etag: string; meta: SourceMeta }

/** How long the app waits for a source's `/meta` before it shows the source's resources as unavailable. */
export const sourceTimeoutMs = 10_000

// The combined results keep their identity while nothing changes, so what is merged from them does too.
const combine = (results: UseQueryResult<Loaded>[]) => results.map((result) => ({ data: result.data?.meta, error: result.error }))

/**
 * Each source's `/meta`, read with the user's token from that API and scoped to the resources the app draws from it
 * (`sourceMeta`). Like the app's own, it is read again on window focus with `If-None-Match`, and a source that cannot be
 * read is an `error` without holding up the others or the app.
 */
export const useSourceMetas = (sources: readonly SourceRef[], clientOf: (source: SourceRef) => Client): SourceResult[] => {
  const queryClient = useQueryClient()
  const results = useQueries({
    queries: sources.map((source) => {
      const queryKey = keys.sourceMeta(source.url, source.resources)
      return {
        queryKey,
        staleTime: 0,
        refetchOnWindowFocus: 'always' as const,
        queryFn: async (): Promise<Loaded> => {
          const previous = queryClient.getQueryData<Loaded>(queryKey)
          const result = await clientOf(source).meta(previous?.etag, { signal: AbortSignal.timeout(sourceTimeoutMs) })
          if (result.status === 'unchanged') {
            if (!previous) throw new Error(`${source.label} answered 304 to a request without If-None-Match`)
            return previous
          }
          return { etag: result.etag, meta: sourceMeta(result.meta, source) }
        },
      }
    }),
    combine,
  })
  // A source read before keeps its resources when a later read fails, as the app's own `/meta` does.
  return useMemo(
    () =>
      sources.map((source, index): SourceResult => {
        const { data, error } = results[index]!
        if (data) return { source, state: 'ready', meta: data }
        if (error) return { source, state: 'error', error }
        return { source, state: 'loading' }
      }),
    [sources, results],
  )
}
