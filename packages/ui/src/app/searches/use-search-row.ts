import { useMutation, useQuery } from '@tanstack/react-query'
import type { ResourceModel, SearchesOfModel, ViewModel } from '@protobase/schema'
import { useClient } from '../../data/api-provider'
import { humanize } from '../../live/naming'
import { countQuery, useRefreshResource } from '../pages/use-layout-data'
import type { RecordRowBodyProps } from '../record-row/record-row-body'
import { chipsText } from './filter-chip-list'
import { isUnseen, unseenFilter } from './saved-search'
import { useFilterChips } from './use-filter-chips'
import type { SavedSearchRow } from './use-saved-searches'
import { text } from './messages'

type SearchRowInput = {
  /** The saved searches' resource, whose view's `searchesOf` is `of`. */
  model: ResourceModel
  of: SearchesOfModel
  /** The resource searched and its view. */
  target: ResourceModel
  targetView: ViewModel | undefined
  row: SavedSearchRow
  /** The search's key, in the text form the record API takes. */
  recordKey: string
}

/**
 * One saved search as a row of what it finds: its name, if it has one, its filters as chips, its title (the name, or
 * the chips as words), and the `RecordRowBody` of its records: with `unseen` newest first, those new to the user marked
 * "New", saying so when none are, and "View all results", which opens the list from the search and counts as having
 * seen them.
 */
export const useSearchRow = ({ model, of, target, targetView, row, recordKey }: SearchRowInput) => {
  const client = useClient()
  const refresh = useRefreshResource()
  const filter = String(row[of.filter] ?? '')
  const chips = useFilterChips(target, filter)
  const stored = of.name === undefined ? undefined : row[of.name]
  const name = typeof stored === 'string' && stored !== '' ? stored : undefined
  const unseen = of.unseen
  const markSeen = useMutation({
    mutationFn: (seenAt: string) => client.update(model.name, recordKey, { [unseen!.seenAt]: seenAt }, row.etag ?? '*'),
    onSettled: () => refresh(model.name),
  })
  // How many of its records are new, to say when none are; every record is new to a search never seen
  const newCount = useQuery({ ...countQuery(client, target, unseen ? unseenFilter(filter, unseen.field, row[unseen.seenAt]) : ''), enabled: unseen !== undefined })
  const plural = (targetView?.names?.plural ?? humanize(target.name)).toLowerCase()
  const body: RecordRowBodyProps = {
    model: target,
    view: targetView,
    filter,
    sort: unseen ? `${unseen.field} desc` : undefined,
    limit: of.limit,
    chips: name !== undefined,
    empty: text('noneMatch', { plural }),
    note: unseen && newCount.data === 0 && text('noNew', { plural }),
    isNew: unseen && ((record) => isUnseen(record.record[unseen.field], row[unseen.seenAt])),
    viewAll: { label: text('viewAll'), savedSearch: recordKey, ...(unseen && { onOpen: () => markSeen.mutate(new Date().toISOString()) }) },
  }
  return { name, chips, title: name ?? chipsText(chips), body }
}
