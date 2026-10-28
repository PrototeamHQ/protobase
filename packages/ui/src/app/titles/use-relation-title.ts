import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { ResourceModel } from '@protobase/schema'
import { useClient } from '../../data/api-provider'
import { useAdminMeta } from '../meta-gate'
import { useRecordTitle } from './record-titles'
import { relationTitle, relationTitleQuery } from './relation-title'

/**
 * The name of the record `id` of `target` a relation points at, for the reader: its label, or its view's derived title.
 * Undefined while it loads or when not `enabled`; a list seeds the names of its page's records, which it reads first.
 */
export const useRelationTitle = (target: ResourceModel, id: string, enabled = true) => {
  const { views } = useAdminMeta()
  const client = useClient()
  const queryClient = useQueryClient()
  const titleOf = useRecordTitle()
  const view = views[target.name]
  const read = useQuery({ ...relationTitleQuery(queryClient, client, target, view, id), staleTime: 5 * 60_000, enabled })
  return relationTitle(read.data, titleOf, target, view, id)
}
