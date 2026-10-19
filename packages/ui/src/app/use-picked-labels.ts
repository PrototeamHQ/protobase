import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query'
import type { ResourceModel, ViewModel } from '@protobase/schema'
import { useClient } from '../data/api-provider'
import { keys } from '../data/query-keys'
import { fetchLabels, type Labels } from '../live/relation-labels'

/** The names of the chosen records, fetched in one list call; the previous names stay while the next ones load. */
export const usePickedLabels = (target: ResourceModel, view: ViewModel | undefined, ids: string[]): Labels => {
  const client = useClient()
  const queryClient = useQueryClient()
  const sorted = [...new Set(ids)].sort()
  const labels = useQuery({
    queryKey: keys.pickedLabels(target.name, sorted.join(',')),
    enabled: sorted.length > 0,
    placeholderData: keepPreviousData,
    queryFn: () => fetchLabels(queryClient, client, target, sorted, view),
  })
  return labels.data ?? new Map()
}
