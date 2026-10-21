import { useQueries, useQuery } from '@tanstack/react-query'
import { filterText, type AggregateParams, type FilterInput, type SeriesParams } from '@protobase/client'
import { useClient } from './api-provider'
import { keys } from './query-keys'

export const useFacets = (resource: string, field: string, filter?: FilterInput, enabled = true) => {
  const client = useClient()
  const text = filterText(filter) ?? ''
  return useQuery({ queryKey: keys.facets(resource, field, text), enabled, queryFn: () => client.facets(resource, field, { filter: text, limit: 50 }) })
}

export const useSeries = (resource: string, params: SeriesParams & { filter?: FilterInput }, enabled = true) => {
  const client = useClient()
  const text = filterText(params.filter) ?? ''
  return useQuery({
    queryKey: keys.series(resource, params.field, `${params.range ?? ''}${params.from ?? ''}${params.to ?? ''}`, params.granularity ?? '', text),
    enabled,
    queryFn: () => client.series(resource, { ...params, filter: text }),
  })
}

export const useHistogram = (resource: string, field: string, filter?: FilterInput, buckets = 20, enabled = true) => {
  const client = useClient()
  const text = filterText(filter) ?? ''
  return useQuery({ queryKey: keys.histogram(resource, field, buckets, text), enabled, queryFn: () => client.histogram(resource, field, { filter: text, buckets }) })
}

/** Totals per value or date bucket of a field (`:aggregate`), refetched whenever the resource is written. */
export const useAggregate = (resource: string, params: AggregateParams, enabled = true) => {
  const client = useClient()
  const wire = { ...params, filter: filterText(params.filter) ?? '' }
  return useQuery({ queryKey: keys.aggregate(resource, JSON.stringify(wire)), enabled, queryFn: () => client.aggregate(resource, wire) })
}

/** Several `:aggregate` reads of one resource at once, in the order of `requests`, cached as `useAggregate` caches each. */
export const useAggregates = (resource: string, requests: AggregateParams[], enabled = true) => {
  const client = useClient()
  return useQueries({
    queries: requests.map((params) => {
      const wire = { ...params, filter: filterText(params.filter) ?? '' }
      return { queryKey: keys.aggregate(resource, JSON.stringify(wire)), enabled, queryFn: () => client.aggregate(resource, wire) }
    }),
  })
}
