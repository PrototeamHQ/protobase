import { useQueries, useQueryClient } from '@tanstack/react-query'
import type { AppAddress, ResourceModel, ViewModel } from '@protobase/schema'
import { useClient } from '../data/api-provider'
import { relationTitle, relationTitleQuery } from './titles/relation-title'
import { useRecordTitle } from './titles/record-titles'

/** Per relation the record holds, the address and name of the record it points at, derived for the reader where its view does. The tenant is left out. */
export const useRelatedRecords = (model: ResourceModel, resources: Record<string, ResourceModel>, views: Record<string, ViewModel>, record: Record<string, unknown>) => {
  const client = useClient()
  const queryClient = useQueryClient()
  const titleOf = useRecordTitle()
  const relations = Object.values(model.fields).filter(
    (field) => field.type === 'relation' && field.relation && field.name !== model.tenant && record[field.name] != null && resources[field.relation.resource]?.primaryKey.length === 1,
  )
  const labels = useQueries({
    queries: relations.map((field) => {
      const target = resources[field.relation!.resource]!
      return relationTitleQuery(queryClient, client, target, views[target.name], String(record[field.name]))
    }),
  })
  const addresses = relations.map((field): AppAddress => ({ kind: 'record', resource: field.relation!.resource, key: String(record[field.name]) }))
  return {
    addresses: Object.fromEntries(relations.map((field, index) => [field.name, addresses[index]!])),
    labels: Object.fromEntries(
      relations.map((field, index) => {
        const target = resources[field.relation!.resource]!
        return [field.name, relationTitle(labels[index]?.data, titleOf, target, views[target.name], String(record[field.name]))]
      }),
    ),
  }
}
