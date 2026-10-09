import { useQueries, useQueryClient } from '@tanstack/react-query'
import type { ResourceModel, ViewModel } from '@protobase/schema'
import { useClient } from '../data/api-provider'
import { keys } from '../data/query-keys'
import type { RelatedRecord } from '../record-view'
import { humanize } from '../live/naming'
import { fetchLabels } from '../live/relation-labels'

/** One entry per relation the record holds, named by the record it points at. The tenant is left out. */
export const useRelatedRecords = (model: ResourceModel, view: ViewModel | undefined, resources: Record<string, ResourceModel>, views: Record<string, ViewModel>, record: Record<string, unknown>, basePath: string) => {
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
  return {
    hrefs: Object.fromEntries(relations.map((field) => [field.name, `/${field.relation!.resource}/${encodeURIComponent(String(record[field.name]))}`])),
    labels: Object.fromEntries(relations.map((field, index) => [field.name, labels[index]?.data])),
    records: relations.map((field, index): RelatedRecord => ({
      kind: view?.fields[field.name]?.label ?? humanize(field.name),
      label: labels[index]?.data ?? String(record[field.name]),
      href: `${basePath}/${field.relation!.resource}/${encodeURIComponent(String(record[field.name]))}`,
    })),
  }
}
