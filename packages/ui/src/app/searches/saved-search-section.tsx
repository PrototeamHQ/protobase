import { useMutation } from '@tanstack/react-query'
import { Trash2 } from 'lucide-react'
import type { ResourceModel, SearchesOfModel, ViewModel } from '@protobase/schema'
import { tableDisplay } from '@protobase/schema/internal'
import { useClient } from '../../data/api-provider'
import { humanize } from '../../live/naming'
import { Button } from '../../primitives/button'
import { EmbeddedList } from '../embedded-list/embedded-list'
import { defaultOrderBy } from '../list-order'
import { useRefreshResource } from '../pages/use-layout-data'
import { AppLink } from '../use-app-address'
import { searchName, unseenFilter } from './saved-search'
import { SearchControls } from './search-controls'
import { useFilterChips } from './use-filter-chips'
import type { SavedSearchRow } from './use-saved-searches'

const chipClass = 'inline-flex h-6 items-center rounded-full border border-primary-border bg-primary-soft px-2.5 text-xs font-medium text-primary-text'

const defaultLimit = 12

type SavedSearchSectionProps = {
  /** The saved searches' resource and its view, whose `searchesOf` is `of`. */
  model: ResourceModel
  view: ViewModel
  of: SearchesOfModel
  /** The resource searched and its view. */
  target: ResourceModel
  targetView: ViewModel | undefined
  row: SavedSearchRow
  /** The search's key, in the text form the record API takes. */
  recordKey: string
  title: string
  /** Deletes the search, after asking; absent for a user who may not. */
  onDelete?: () => void
}

/**
 * One saved search: its name and filters, its controls and delete, and a row of the records it finds that are new to
 * the user (with `unseen`), newest first, with "View all results", which opens the list with its filter and counts as
 * having seen them.
 */
export const SavedSearchSection = ({ model, view, of, target, targetView, row, recordKey, title, onDelete }: SavedSearchSectionProps) => {
  const client = useClient()
  const refresh = useRefreshResource()
  const filter = String(row[of.filter] ?? '')
  const chips = useFilterChips(target, filter)
  const unseen = of.unseen
  const markSeen = useMutation({
    mutationFn: (seenAt: string) => client.update(model.name, recordKey, { [unseen!.seenAt]: seenAt }, row.etag ?? '*'),
    onSettled: () => refresh(model.name),
  })
  const cards = targetView?.list?.displays?.find((display) => display.kind === 'cards')
  const plural = (targetView?.names?.plural ?? humanize(target.name)).toLowerCase()

  return (
    <section aria-label={title} className="flex flex-col gap-3 rounded-lg border bg-surface p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-2">
          <h2 className="text-[15px] font-semibold">
            <AppLink to={{ kind: 'record', resource: model.name, key: recordKey }} className="hover:underline">
              {title}
            </AppLink>
          </h2>
          {/* A search named after its filters says them already */}
          {chips.length > 0 && searchName(chips) !== title && (
            <ul className="flex flex-wrap gap-1.5" aria-label="Filters">
              {chips.map((chip) => (
                <li key={chip.key} className={chipClass}>
                  {chip.label}
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {of.controls && <SearchControls model={model} view={view} recordKey={recordKey} row={row} fields={of.controls} />}
          {onDelete && (
            <Button variant="ghost" aria-label={`Delete ${title}`} onClick={onDelete}>
              <Trash2 className="size-3.5" aria-hidden />
            </Button>
          )}
        </div>
      </div>
      <EmbeddedList
        model={target}
        view={targetView}
        filter={unseen ? unseenFilter(filter, unseen.field, row[unseen.seenAt]) : filter}
        sort={unseen ? `${unseen.field} desc` : defaultOrderBy(target, targetView)}
        limit={of.limit ?? defaultLimit}
        display={cards?.name ?? tableDisplay}
        row
        empty={unseen ? `No new ${plural} since you last looked.` : `No ${plural} match.`}
        viewAll={{ filter, label: 'View all results', ...(unseen && { onOpen: () => markSeen.mutate(new Date().toISOString()) }) }}
      />
    </section>
  )
}
