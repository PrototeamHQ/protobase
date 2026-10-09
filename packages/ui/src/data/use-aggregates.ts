import { useQuery } from '@tanstack/react-query'
import { filterText, type FilterInput, type SeriesParams } from '@protobase/client'
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
