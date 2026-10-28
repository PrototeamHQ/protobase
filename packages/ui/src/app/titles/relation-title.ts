import type { QueryClient } from '@tanstack/react-query'
import type { ResourceModel, ViewModel } from '@protobase/schema'
import type { Client } from '@protobase/client'
import { keys } from '../../data/query-keys'
import { fetchLabels } from '../../live/relation-labels'
import { readTitleRows, titleRowKey } from '../../live/title-rows'
import type { RecordTitleOf } from './record-title-of'

/** What names a record a relation points at: its label, or for a view that derives titles, the fields the rule reads. */
type RelationTitleData = { label: string } | { row: Record<string, unknown> | null }

/**
 * The query naming the record `id` of a single-key resource that a relation points at: its label field, cached as other
 * labels are, or the fields its view's derived title reads, which `relationTitle` titles for the reader.
 */
export const relationTitleQuery = (queryClient: QueryClient, client: Client, target: ResourceModel, view: ViewModel | undefined, id: string): { queryKey: readonly unknown[]; queryFn: () => Promise<RelationTitleData> } => {
  const from = view?.titleFrom
  if (!from) {
    return { queryKey: keys.relatedLabel(target.name, id), queryFn: async () => ({ label: (await fetchLabels(queryClient, client, target, [id], view)).get(id) ?? id }) }
  }
  return {
    queryKey: titleRowKey(target, id, from.fields),
    queryFn: async () => ({ row: (await readTitleRows(client, target, from.fields, [id])).get(id) ?? null }),
  }
}

/** The name `relationTitleQuery` read, titled for the reader; the key for a record not found, undefined while it loads. */
export const relationTitle = (data: RelationTitleData | undefined, titleOf: RecordTitleOf, target: ResourceModel, view: ViewModel | undefined, id: string) => {
  if (!data) return
  if ('label' in data) return data.label
  return data.row ? titleOf(target, view, data.row, id) : id
}
