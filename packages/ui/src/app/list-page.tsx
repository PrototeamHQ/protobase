import { Plus, SlidersHorizontal } from 'lucide-react'
import { useMemo, useState } from 'react'
import { createWhere, tableDisplay, type FilterExpr, type ResourceModel } from '@protobase/schema'
import { PageHeader } from '../app-shell'
import { useAuth } from '../auth'
import { DataGrid, pinnedStorageKey, type GridRow } from '../data-grid'
import { ActiveFilterChips, FilterPanel, FilterSection, ToolbarRow, activeChips, emptyFilterState, removeChip, type FilterState } from '../filter-panel'
import { useIsDesktop } from '../lib/use-media-query'
import { columnsFromModel } from '../live/columns-from-model'
import { stateToText, textToState } from '../live/filter-string'
import { recordKey, recordTitleField } from '../live/model-helpers'
import { humanize } from '../live/naming'
import { useFilterConfig } from '../live/use-filter-config'
import { useLiveRows } from '../live/use-live-rows'
import { widgetFields } from '../live/view-fields'
import { Button } from '../primitives/button'
import { Sheet } from '../primitives/sheet'
import { useDeleteFlow, type DeleteTarget } from './delete/use-delete-flow'
import { useRestore } from './delete/use-restore'
import { ErrorBanner } from './error-banner'
import { ListCards } from './displays/list-cards'
import { MapDisplay } from './displays/map-display'
import { CustomDisplay } from './displays/custom-display'
import { DisplaySwitch, SortMenu } from './displays/display-controls'
import { loadedFields, shownDisplay } from './displays/list-displays'
import { useDisplayRows } from './displays/use-display-rows'
import { useListScroll } from './list-scroll'
import { ListChart } from './list-chart'
import { parseSort, sortToOrderBy } from './list-order'
import { ListSearch } from './list-search'
import { Notice, useAdminMeta, usePermissions } from './meta-gate'
import { can, rowAllows } from './permissions'
import { useAppAddress, type ListAddress } from './use-app-address'
import { withFieldTypeCells } from './field-types/field-type-cells'
import { useProjectUi } from './pages/project-ui'

const where = createWhere()
const searchText = (extras: FilterExpr[]) => extras.find((clause) => clause.kind === 'search')

export const ListPage = ({ address }: { address: ListAddress }) => {
  const { resources } = useAdminMeta()
  const model = resources[address.resource]
  if (!model) return <Notice title="Not found">There is no resource called {address.resource}.</Notice>
  return <LoadedList model={model} address={address} />
}

const LoadedList = ({ model, address }: { model: ResourceModel; address: ListAddress }) => {
  const meta = useAdminMeta()
  const { set, go } = useAppAddress()
  const resource = model.name
  const view = meta.views[resource]
  const fields = useMemo(() => widgetFields(view, model), [view, model])
  const { fields: fieldTypes } = useProjectUi()
  const columns = useMemo(() => withFieldTypeCells(columnsFromModel(model, view), model, view, fieldTypes), [model, view, fieldTypes])

  const filterText = address.filter
  const parsed = useMemo(() => textToState(fields, filterText), [fields, filterText])
  const state: FilterState = parsed.ok ? parsed.state : emptyFilterState
  const extras = parsed.ok ? parsed.extras : []
  const { orderBy, filterLayout: layout } = address
  const desktop = useIsDesktop()
  const [sheetOpen, setSheetOpen] = useState(false)

  const config = useFilterConfig({ model, resources: meta.resources, views: meta.views, view, state, extras })
  // One load serves the table and every display, labelled for the relations any of them shows
  const loaded = useMemo(() => loadedFields(model, view, columns.map((column) => column.id)), [model, view, columns])
  const rows = useLiveRows({ resources: meta.resources, views: meta.views, model, columns: loaded, filter: parsed.ok ? filterText : '', orderBy })
  const display = shownDisplay(view, address.display)
  // The map and custom displays page through the rows with `loadMore`; the table and cards scroll through them
  const displayRows = useDisplayRows(model, rows.page, rows.key, display !== undefined && display.kind !== 'cards')
  const scroll = useListScroll()

  const titleField = recordTitleField(model, view)
  const target = (row: GridRow): DeleteTarget => ({
    key: row.id,
    title: String(typeof row[titleField] === 'object' ? (row[titleField] as { name?: unknown }).name : (row[titleField] ?? row.id)),
    etag: typeof row.etag === 'string' ? row.etag : undefined,
    snapshot: row,
  })
  const singular = view?.names?.singular ?? humanize(resource)
  const permissions = usePermissions(resource)
  const { state: auth } = useAuth()
  const restore = useRestore(model)
  const remove = useDeleteFlow({ model, view, restore, onReview: (deleted) => go({ kind: 'record', resource, key: deleted.key }) })

  const setFilter = (next: FilterState, nextExtras = extras) => set({ filter: stateToText(fields, next, nextExtras) })
  const search = searchText(extras)
  const commitSearch = (text: string) => {
    const others = extras.filter((clause) => clause.kind !== 'search')
    setFilter(state, text ? [...others, where.search(text)] : others)
  }
  const plural = view?.names?.plural ?? humanize(resource)
  const sortMenu = display && <SortMenu model={model} view={view} display={display} orderBy={orderBy} onChange={(next) => set({ orderBy: next })} />
  const searchBox = model.search?.length ? <ListSearch value={search?.kind === 'search' ? search.text : ''} onCommit={commitSearch} placeholder={`Search ${plural.toLowerCase()}`} className={desktop ? undefined : 'min-h-11'} /> : null
  // On a desktop the sort, the filters and the search share one row below the title; a phone has the filters button
  // beside the search, and the sort in the filters sheet
  // The side panel layout leaves the sort and the search in a row of their own
  const panel = <FilterPanel layout={layout} config={config} value={state} onChange={setFilter} leading={layout === 'bar' ? sortMenu : undefined} trailing={searchBox} />
  const desktopToolbar = layout === 'bar' ? panel : <ToolbarRow groups={[sortMenu ? [sortMenu] : []]} trailing={searchBox} />
  const chips = activeChips(config, state)
  const chipsRow = <ActiveFilterChips scroll chips={chips} onRemove={(key) => setFilter(removeChip(state, key))} onClear={() => setFilter(emptyFilterState)} />
  const phoneSort = display && (
    <FilterSection title="Sort">
      <SortMenu model={model} view={view} display={display} orderBy={orderBy} onChange={(next) => set({ orderBy: next })} className="min-h-11 w-full" />
    </FilterSection>
  )
  const phoneFilters = (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <Button className="min-h-11" onClick={() => setSheetOpen(true)} aria-haspopup="dialog">
          <SlidersHorizontal className="size-3.5" />
          Filters{chips.length > 0 && ` (${chips.length})`}
        </Button>
        {searchBox ?? <div className="min-w-0 flex-1">{chipsRow}</div>}
      </div>
      {searchBox && chipsRow}
      <Sheet title="Filters" open={sheetOpen} onClose={() => setSheetOpen(false)}>
        <FilterPanel layout="panel" fullWidth config={config} value={state} onChange={setFilter} leading={phoneSort} />
      </Sheet>
    </div>
  )
  const createButton = can(permissions, 'create') && (
    <Button variant="primary" onClick={() => go({ kind: 'create', resource })}>
      <Plus className="size-3.5" />
      New {singular.toLowerCase()}
    </Button>
  )
  const displaySwitch = (menu: boolean) => <DisplaySwitch view={view} value={display?.name ?? tableDisplay} onChange={(name) => set({ display: name })} menu={menu} />

  const openRecord = (row: GridRow) => go({ kind: 'record', resource, key: recordKey(model, row) })

  const table = rows.source ? (
    <DataGrid
      columns={columns}
      source={rows.source}
      sort={parseSort(orderBy)}
      onSortChange={(sort) => set({ orderBy: sortToOrderBy(sort) })}
      onOpenRow={openRecord}
      initialScrollIndex={scroll.initialIndex}
      onScrollIndex={scroll.remember}
      rowActions={[
        { label: `Open ${singular.toLowerCase()}`, onSelect: openRecord },
        ...(can(permissions, 'delete') ? [{ label: 'Delete', destructive: true, available: (row: GridRow) => rowAllows(row, 'delete'), onSelect: (row: GridRow) => void remove.start(target(row)) }] : []),
      ]}
      bulkActions={can(permissions, 'delete') ? [{ label: (count: number) => `Delete ${count}`, destructive: true, onRun: (rows: GridRow[]) => remove.startBulk(rows.map(target)) }] : []}
      rowNumbers={false}
      pinKey={auth.kind === 'signed-in' ? pinnedStorageKey(auth.user.id, resource) : undefined}
      className="min-h-0 flex-1"
    />
  ) : (
    <div className="flex-1 rounded-lg border bg-surface" />
  )
  const cardsList = { ...rows, initialIndex: scroll.initialIndex, onScrollIndex: scroll.remember }
  const drawDisplay = () => {
    if (!display) return table
    // A change of filter or sort starts the cards again at the top
    if (display.kind === 'cards') return <ListCards key={rows.key.join(' ')} model={model} view={view} display={display} list={cardsList} />
    if (display.kind === 'map') return <MapDisplay model={model} view={view} display={display} list={displayRows} />
    return <CustomDisplay display={display} list={displayRows} />
  }
  const shown = drawDisplay()

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 px-5 py-4">
      {remove.dialogs}
      <PageHeader
        title={plural}
        subtitle={view?.help}
        aside={!desktop && displaySwitch(true)}
        actions={
          desktop ? (
            <>
              {displaySwitch(false)}
              {createButton}
            </>
          ) : (
            createButton
          )
        }
      />
      {!parsed.ok && <ErrorBanner title="The filter in the address could not be read" error={new Error(parsed.errors.map((error) => error.message).join('; '))} />}
      {rows.error && !display && <ErrorBanner title="Could not load rows" error={rows.error} />}
      {view?.chart && <ListChart resource={resource} chart={view.chart} title={`${plural} created`} noun={plural.toLowerCase()} filter={parsed.ok ? filterText : ''} />}
      {desktop ? desktopToolbar : phoneFilters}
      {desktop && layout === 'panel' ? (
        <div className="flex min-h-0 flex-1 gap-4">
          {panel}
          {shown}
        </div>
      ) : (
        shown
      )}
    </div>
  )
}
