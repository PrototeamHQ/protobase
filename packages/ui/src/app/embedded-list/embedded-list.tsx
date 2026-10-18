import { ArrowRight } from 'lucide-react'
import { useMemo, useState } from 'react'
import type { ResourceModel, ViewModel } from '@protobase/schema'
import { DataGrid, type GridRow } from '../../data-grid'
import { useIsDesktop, useIsXs } from '../../lib/use-media-query'
import { listColumnNames } from '../../live/columns-from-model'
import { recordKey } from '../../live/model-helpers'
import { humanize } from '../../live/naming'
import { Skeleton } from '../../primitives/skeleton'
import { BoardDisplay } from '../displays/board-display'
import { CardsDisplay } from '../displays/cards-display'
import { CustomDisplay } from '../displays/custom-display'
import { MapDisplay } from '../displays/map-display'
import { DisplaySwitch } from '../displays/display-controls'
import type { ListDisplay } from '../displays/display-context'
import { displayRow, loadedFields, shownDisplay } from '../displays/list-displays'
import { ErrorBanner } from '../error-banner'
import { useProjectUi } from '../pages/project-ui'
import { defaultOrderBy, parseSort, sortToOrderBy } from '../list-order'
import { useAdminMeta } from '../meta-gate'
import { AppLink, useAppAddress } from '../use-app-address'
import { embeddedColumns } from './embedded-columns'
import { viewAllAddress } from './embedded-display'
import { cutOffNote } from './cut-off-note'
import { useEmbeddedRows } from './use-embedded-rows'

export type EmbeddedListProps = {
  model: ResourceModel
  view: ViewModel | undefined
  filter: string
  /** The order to start in, the list's own when empty; the table's headers change it. */
  sort: string
  /** The table's columns, through relations too (`unit_id.property_id`); the list's columns by default. */
  columns?: string[]
  limit: number
  /** The display shown, from `useEmbeddedDisplay`. */
  display: string
  empty?: string
  /** The cards in one row that scrolls sideways on every screen, not only on a phone. */
  row?: boolean
  /**
   * Where "View all" leads instead of the same list: the list with this filter, opened from the saved search
   * `savedSearch`, under this label, calling `onOpen` first.
   */
  viewAll?: { filter: string; label: string; savedSearch?: string; onOpen?: () => void }
  /** Whether it ends with the link to the whole list. */
  link?: boolean
}

/** The switch between the table and the view's displays, for an embedded list's heading; nothing with only a table. */
export const EmbeddedDisplaySwitch = ({ view, value, onChange }: { view: ViewModel | undefined; value: string; onChange: (display: string) => void }) => (
  <DisplaySwitch view={view} value={value} onChange={onChange} menu={!useIsDesktop()} />
)

const Loading = () => <div className="flex flex-col gap-2">{Array.from({ length: 3 }, (_, index) => <Skeleton key={index} className="h-4 w-full" />)}</div>

/**
 * The first `limit` records of a list, drawn by the list page's own table (sized to its rows) or display, and a link
 * to the whole list with the same filter, order and display, beside a note such as "The first 10 of 37." when there are
 * more. On a phone a cards display is one row that scrolls sideways.
 */
export const EmbeddedList = ({ model, view, filter, sort, columns, limit, display, empty, row = false, viewAll, link = true }: EmbeddedListProps) => {
  const { resources, views } = useAdminMeta()
  const { fields: fieldTypes } = useProjectUi()
  const { go, href } = useAppAddress()
  const xs = useIsXs()
  const [orderBy, setOrderBy] = useState(sort || defaultOrderBy(model, view))
  const names = columns ?? listColumnNames(model, view)
  const specs = useMemo(() => embeddedColumns(model, view, names, { resources, views, fieldTypes }), [model, view, names.join(','), resources, views, fieldTypes])
  const fields = useMemo(() => loadedFields(model, view, specs.map((spec) => spec.id)), [model, view, specs])
  const rows = useEmbeddedRows({ model, filter, orderBy, limit, fields })
  const loaded = rows.data?.rows
  const source = useMemo(() => loaded && { total: loaded.length, rowAt: (index: number) => loaded[index]! }, [loaded])
  const shown = shownDisplay(view, display)

  const plural = view?.names?.plural ?? humanize(model.name)
  const allLink = link && (
    <AppLink
      to={viewAllAddress(model, view, xs, viewAll ? { filter: viewAll.filter, orderBy: defaultOrderBy(model, view), display, savedSearch: viewAll.savedSearch } : { filter, orderBy, display })}
      onClick={viewAll?.onOpen}
      className="flex items-center gap-1 self-end font-medium text-primary-text hover:underline"
    >
      {viewAll ? viewAll.label : <>View all <span className="sr-only">{plural.toLowerCase()}</span></>}
      <ArrowRight className="size-3.5" aria-hidden />
    </AppLink>
  )

  if (rows.isPending) return <Loading />
  if (rows.error) return <ErrorBanner title="Could not load" error={rows.error} />
  // A link of its own still leads somewhere when nothing here matches
  if (!source || source.total === 0) {
    const nothing = <p className="text-muted-foreground">{empty ?? 'Nothing here yet.'}</p>
    return viewAll && link ? <div className="flex flex-col gap-3">{nothing}{allLink}</div> : nothing
  }

  const list: ListDisplay = {
    resource: model.name,
    rows: rows.data.rows.map((row) => displayRow(model, row)),
    total: rows.data.total,
    loading: false,
    error: null,
    more: false,
    loadMore: () => undefined,
  }
  const openRecord = (row: GridRow) => go({ kind: 'record', resource: model.name, key: recordKey(model, row) })
  const recordLink = (row: GridRow) => ({ href: href({ kind: 'record', resource: model.name, key: recordKey(model, row) }), onFollow: () => openRecord(row) })
  const singular = view?.names?.singular ?? humanize(model.name)
  const note = cutOffNote(source.total, rows.data.total, rows.data.estimated)
  return (
    <div className="flex flex-col gap-3">
      {!shown ? (
        <DataGrid
          fit
          columns={specs}
          source={source}
          latencyMs={0}
          sort={parseSort(orderBy)}
          onSortChange={(next) => setOrderBy(sortToOrderBy(next))}
          onOpenRow={openRecord}
          rowLink={recordLink}
          rowActions={[{ label: `Open ${singular.toLowerCase()}`, onSelect: openRecord }]}
          rowNumbers={false}
          selectable={false}
        />
      ) : shown.kind === 'cards' ? (
        <CardsDisplay model={model} view={view} display={shown} list={list} row={row || xs} footer={false} />
      ) : shown.kind === 'map' ? (
        <MapDisplay model={model} view={view} display={shown} filter={filter} orderBy={orderBy} fields={fields} footer={false} />
      ) : shown.kind === 'board' ? (
        <BoardDisplay model={model} view={view} display={shown} fields={fields} filter={filter} orderBy={orderBy} limit={limit} />
      ) : (
        <CustomDisplay display={shown} list={list} />
      )}
      {note && link ? (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-muted-foreground">{note}</p>
          {allLink}
        </div>
      ) : (
        allLink
      )}
    </div>
  )
}
