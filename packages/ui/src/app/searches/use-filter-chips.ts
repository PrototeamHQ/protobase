import { useQueries, useQueryClient } from '@tanstack/react-query'
import type { ResourceModel } from '@protobase/schema'
import { useClient } from '../../data/api-provider'
import { keys } from '../../data/query-keys'
import { fetchLabels } from '../../live/relation-labels'
import { useAdminMeta } from '../meta-gate'
import { chosenRelations, filterChips, type ValueNames } from './saved-search'

/** A saved filter of `model`'s list as chips, with the records its relation facets choose named once they have loaded. */
export const useFilterChips = (model: ResourceModel, text: string) => {
  const client = useClient()
  const queryClient = useQueryClient()
  const { resources, views } = useAdminMeta()
  const view = views[model.name]
  const chosen = Object.entries(chosenRelations(model, view, text))
  const named = useQueries({
    queries: chosen.map(([field, ids]) => {
      const target = resources[model.fields[field]!.relation!.resource]
      return {
        queryKey: keys.labels(`chips:${model.name}.${field}`, ids.join(',')),
        enabled: target !== undefined,
        queryFn: async () => Object.fromEntries(await fetchLabels(queryClient, client, target!, ids, views[target!.name])),
      }
    }),
  })
  const names: ValueNames = Object.fromEntries(chosen.flatMap(([field], index) => (named[index]?.data ? [[field, named[index].data]] : [])))
  return filterChips(model, view, text, names)
}
