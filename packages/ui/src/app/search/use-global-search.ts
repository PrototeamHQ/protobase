import { useQueries } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import type { SearchResultGroup } from '../../app-shell'
import { useClient } from '../../data/api-provider'
import { useRouter } from '../router'
import { useDebounced } from '../../lib/use-debounced'
import { useAdminMeta } from '../meta-gate'
import { hitsPerResource, minimumQuery, searchFields, searchFilter, searchPlaceholder, searchTargets, toHit } from './search-model'

/**
 * The top bar's search: the typed text, searched in every resource the user can read that has search fields, through
 * the list API with the user's token, so row filters and hidden fields apply exactly as on the lists. The results stay
 * while the text does, so opening the box again asks nothing; other texts' results are dropped, so changed text asks again.
 */
export const useGlobalSearch = () => {
  const meta = useAdminMeta()
  const client = useClient()
  const { basePath } = useRouter()
  const targets = useMemo(() => searchTargets(meta), [meta])
  const [text, setText] = useState('')
  const typed = text.trim()
  const query = useDebounced(typed, 200)
  const wanted = typed.length >= minimumQuery
  const searching = wanted && query.length >= minimumQuery
  const results = useQueries({
    queries: targets.map((target) => ({
      queryKey: ['global-search', target.model.name, query],
      enabled: searching,
      staleTime: Infinity,
      gcTime: 0,
      queryFn: () => client.list(target.model.name, { filter: searchFilter(query), pageSize: hitsPerResource, fields: searchFields(target) }),
    })),
  })
  const groups = targets.flatMap((target, index): SearchResultGroup[] => {
    const result = results[index]
    if (!searching || !result) return []
    if (result.error) return [{ id: target.model.name, label: target.label, hits: [], failed: true }]
    const hits = (result.data?.items ?? []).map((row) => toHit(target, row, query, basePath))
    return hits.length > 0 ? [{ id: target.model.name, label: target.label, hits }] : []
  })
  return {
    /** False when no resource can be searched; the top bar then shows no search box. */
    available: targets.length > 0,
    placeholder: searchPlaceholder(targets),
    text,
    setText,
    /** The text the results belong to, once it is long enough to search. */
    query: searching ? query : '',
    loading: wanted && (typed !== query || results.some((result) => result.isFetching)),
    groups,
  }
}
