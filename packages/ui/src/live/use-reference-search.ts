import { keepPreviousData, useQueries } from '@tanstack/react-query'
import { useState } from 'react'
import { createWhere, printFilter, type ResourceModel, type ViewModel } from '@protobase/schema'
import { useClient } from '../data/api-provider'
import type { RecordTitleOf } from '../app/titles/record-title-of'
import { labelFieldOf } from './model-helpers'

const where = createWhere()

export type ReferenceSearch = {
  /** Set while text is typed into a target with search fields: the matching records' keys and names. */
  matches?: Array<[string, string]>
  onSearch?: (text: string) => void
}

/**
 * The search text typed into each facet's combobox and the records of its target resource that match it. A facet
 * without a target, or whose target has no search fields or a composite key, gets nothing: its options are filtered
 * by name instead. A target whose view derives its titles names its records by `titleOf`, for the reader.
 */
export const useReferenceSearch = (targets: Array<{ id: string; target?: ResourceModel }>, views: Record<string, ViewModel>, titleOf: RecordTitleOf): ReferenceSearch[] => {
  const client = useClient()
  const [texts, setTexts] = useState<Record<string, string>>({})
  const searchable = (target?: ResourceModel): target is ResourceModel => Boolean(target?.search?.length) && target!.primaryKey.length === 1
  // The fields that name a target's records: its label field, or the fields its view's derived title reads
  const nameFields = (target: ResourceModel) => {
    const view = views[target.name]
    return [target.primaryKey[0]!, ...(view?.titleFrom ? view.titleFrom.fields : [labelFieldOf(target, view)])]
  }
  const named = (target: ResourceModel, item: Record<string, unknown>): [string, string] => {
    const view = views[target.name]
    const key = String(item[target.primaryKey[0]!])
    return [key, view?.titleFrom ? titleOf(target, view, item, key) : String(item[labelFieldOf(target, view)])]
  }

  const results = useQueries({
    queries: targets.map(({ id, target }) => {
      const text = (texts[id] ?? '').trim()
      return {
        queryKey: ['reference-search', id, target?.name ?? '', text],
        enabled: searchable(target) && text !== '',
        placeholderData: keepPreviousData,
        queryFn: async () => {
          const page = await client.list(target!.name, { filter: printFilter(where.search(text)), fields: nameFields(target!), pageSize: 20 })
          return page.items
        },
      }
    }),
  })

  return targets.map(({ id, target }, index) => {
    if (!searchable(target)) return {}
    const onSearch = (text: string) => setTexts((current) => ({ ...current, [id]: text }))
    if ((texts[id] ?? '').trim() === '') return { onSearch }
    return { onSearch, matches: (results[index]?.data ?? []).map((item) => named(target, item)) }
  })
}
