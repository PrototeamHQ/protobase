import { keepPreviousData, useQueries } from '@tanstack/react-query'
import { useState } from 'react'
import { createWhere, printFilter, type ResourceModel, type ViewModel } from '@protobase/schema'
import { useClient } from '../data/api-provider'
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
 * by name instead.
 */
export const useReferenceSearch = (targets: Array<{ id: string; target?: ResourceModel }>, views: Record<string, ViewModel>): ReferenceSearch[] => {
  const client = useClient()
  const [texts, setTexts] = useState<Record<string, string>>({})
  const searchable = (target?: ResourceModel): target is ResourceModel => Boolean(target?.search?.length) && target!.primaryKey.length === 1

  const results = useQueries({
    queries: targets.map(({ id, target }) => {
      const text = (texts[id] ?? '').trim()
      return {
        queryKey: ['reference-search', id, target?.name ?? '', text],
        enabled: searchable(target) && text !== '',
        placeholderData: keepPreviousData,
        queryFn: async () => {
          const keyField = target!.primaryKey[0]!
          const labelField = labelFieldOf(target!, views[target!.name])
          const page = await client.list(target!.name, { filter: printFilter(where.search(text)), fields: [keyField, labelField], pageSize: 20 })
          return page.items.map((item): [string, string] => [String(item[keyField]), String(item[labelField])])
        },
      }
    }),
  })

  return targets.map(({ id, target }, index) => {
    if (!searchable(target)) return {}
    const onSearch = (text: string) => setTexts((current) => ({ ...current, [id]: text }))
    if ((texts[id] ?? '').trim() === '') return { onSearch }
    return { onSearch, matches: results[index]?.data ?? [] }
  })
}
