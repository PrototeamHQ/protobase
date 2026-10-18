import { useQueries, useQueryClient } from '@tanstack/react-query'
import type { AppAddress, ResourceModel, ViewModel } from '@protobase/schema'
import { useClient } from '../data/api-provider'
import { keys } from '../data/query-keys'
import { fetchLabels } from '../live/relation-labels'

/** Per relation the record holds, the address and name of the record it points at. The tenant is left out. */
export const useRelatedRecords = (model: ResourceModel, resources: Record<string, ResourceModel>, views: Record<string, ViewModel>, record: Record<string, unknown>) => {
  const client = useClient()
  const queryClient = useQueryClient()
  const relations = Object.values(model.fields).filter(
    (field) => field.type === 'relation' && field.relation && field.name !== model.tenant && record[field.name] != null && resources[field.relation.resource]?.primaryKey.length === 1,
  )
  const labels = useQueries({
    queries: relations.map((field) => {
      const target = resources[field.relation!.resource]!
      const id = String(record[field.name])
      return { queryKey: keys.relatedLabel(target.name, id), queryFn: async () => (await fetchLabels(queryClient, client, target, [id], views[target.name])).get(id) ?? id }
    }),
  })
  const addresses = relations.map((field): AppAddress => ({ kind: 'record', resource: field.relation!.resource, key: String(record[field.name]) }))
  return {
    addresses: Object.fromEntries(relations.map((field, index) => [field.name, addresses[index]!])),
    labels: Object.fromEntries(relations.map((field, index) => [field.name, labels[index]?.data])),
  }
}
