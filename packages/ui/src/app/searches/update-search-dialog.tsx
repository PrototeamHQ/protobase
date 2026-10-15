import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import type { ResourceModel, ViewModel } from '@protobase/schema'
import { tableDisplay } from '@protobase/schema/internal'
import { useClient } from '../../data/api-provider'
import { humanize } from '../../live/naming'
import { Button } from '../../primitives/button'
import { ResponsiveDialog } from '../../primitives/responsive-dialog'
import { Skeleton } from '../../primitives/skeleton'
import { EmbeddedList } from '../embedded-list/embedded-list'
import { defaultOrderBy } from '../list-order'
import { countQuery } from '../pages/use-layout-data'
import { addedFilter, filterChanges, netChange, removedFilter, type FilterChange } from './search-diff'
import { useFilterChips } from './use-filter-chips'

/** How many records each side of the diff shows; its count says how many there are in all. */
const shownLimit = 12

const changeStyle: Record<FilterChange['kind'], { word: string; className: string }> = {
  added: { word: 'Added', className: 'text-success-text' },
  removed: { word: 'Removed', className: 'text-danger-text' },
  changed: { word: 'Changed', className: 'text-primary-text' },
}

const FilterChanges = ({ changes }: { changes: FilterChange[] }) => (
  <ul aria-label="Filter changes" className="divide-y rounded-md border text-[13px]">
    {changes.map((change) => (
      <li key={`${change.kind}:${change.label}`} className="grid grid-cols-[72px_1fr] gap-3 px-3 py-2">
        <span className={`font-medium ${changeStyle[change.kind].className}`}>{changeStyle[change.kind].word}</span>
        {change.kind === 'changed' ? (
          <span>
            <span className="text-muted-foreground line-through">{change.before}</span> <span className="font-medium">{change.label}</span>
          </span>
        ) : (
          <span className={change.kind === 'removed' ? 'text-muted-foreground line-through' : 'font-medium'}>{change.label}</span>
        )}
      </li>
    ))}
  </ul>
)

/** How many records `filter` finds, none for a filter that can find none (`null`). */
const useDiffCount = (model: ResourceModel, filter: string | null) => {
  const query = useQuery({ ...countQuery(useClient(), model, filter ?? ''), enabled: filter !== null })
  return filter === null ? 0 : query.data
}

const count = (n: number, singular: string, plural: string) => `${n} ${n === 1 ? singular : plural}`

type RecordsSideProps = {
  model: ResourceModel
  view: ViewModel | undefined
  title: string
  filter: string | null
  total: number | undefined
  plural: string
}

/** One side of the diff: its title and count, and its first records as the list shows them. */
const RecordsSide = ({ model, view, title, filter, total, plural }: RecordsSideProps) => {
  const cards = view?.list?.displays?.find((display) => display.kind === 'cards')
  return (
    <section aria-label={title} className="flex flex-col gap-2">
      <h3 className="text-[13px] font-semibold">
        {title} <span className="font-normal text-muted-foreground">({total ?? '…'})</span>
      </h3>
      {total !== undefined && total > shownLimit && <p className="text-xs text-muted-foreground">The first {shownLimit} of {total}.</p>}
      {filter === null || total === 0 ? (
        <p className="text-[13px] text-muted-foreground">No {plural}.</p>
      ) : (
        <EmbeddedList model={model} view={view} filter={filter} sort={defaultOrderBy(model, view)} limit={shownLimit} display={cards?.name ?? tableDisplay} row link={false} empty={`No ${plural}.`} />
      )}
    </section>
  )
}

type UpdateSearchDialogProps = {
  /** The resource searched and its view. */
  model: ResourceModel
  view: ViewModel | undefined
  /** What the dialog asks, such as "Update Gardens?". */
  title: string
  /** The search's filter, and the list's that replaces it. */
  before: string
  after: string
  /** What saving another search is called, such as "Save as new search". */
  saveNewLabel: string
  updating: boolean
  creating: boolean
  onUpdate: () => void
  onSaveNew: () => void
  onCancel: () => void
}

/**
 * Asks before a saved search takes the list's filter: what changes in its filters, how many more or fewer records it
 * finds, and the records it would add and drop, each found by the list API (`addedFilter`, `removedFilter`).
 */
export const UpdateSearchDialog = ({ model, view, title, before, after, saveNewLabel, updating, creating, onUpdate, onSaveNew, onCancel }: UpdateSearchDialogProps) => {
  const changes = filterChanges(useFilterChips(model, before), useFilterChips(model, after))
  const added = useMemo(() => addedFilter(before, after), [before, after])
  const removed = useMemo(() => removedFilter(before, after), [before, after])
  const addedCount = useDiffCount(model, added)
  const removedCount = useDiffCount(model, removed)
  const singular = (view?.names?.singular ?? humanize(model.name)).toLowerCase()
  const plural = (view?.names?.plural ?? humanize(model.name)).toLowerCase()
  const counted = addedCount !== undefined && removedCount !== undefined

  return (
    <ResponsiveDialog
      open
      wide
      title={title}
      onClose={onCancel}
      actions={
        <>
          <Button onClick={onCancel}>Cancel</Button>
          <Button loading={creating} disabled={updating} onClick={onSaveNew}>
            {saveNewLabel}
          </Button>
          <Button variant="primary" loading={updating} disabled={creating} onClick={onUpdate}>
            Update
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {changes.length > 0 && <FilterChanges changes={changes} />}
        {counted ? (
          <p className="text-[13px]">
            <span className="font-semibold">{netChange(addedCount, removedCount, singular, plural)}</span>
            <span className="text-muted-foreground">
              : {count(addedCount, singular, plural)} added, {removedCount} removed
            </span>
          </p>
        ) : (
          <Skeleton className="h-4 w-48" />
        )}
        <RecordsSide model={model} view={view} title="Added" filter={added} total={addedCount} plural={plural} />
        <RecordsSide model={model} view={view} title="Removed" filter={removed} total={removedCount} plural={plural} />
      </div>
    </ResponsiveDialog>
  )
}
