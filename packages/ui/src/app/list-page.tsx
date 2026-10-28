import { Download, Plus, SlidersHorizontal } from 'lucide-react'
import { useMemo, useState } from 'react'
import { createWhere, type FilterExpr, type ResourceModel } from '@protobase/schema'
import { isGroupChart, tableDisplay, viewOfList } from '@protobase/schema/internal'
import { PageHeader, usePageScroll } from '../app-shell'
import { useAuth } from '../auth'
import { DataGrid, pinnedStorageKey, type GridRow } from '../data-grid'
import { ActiveFilterChips, FilterPanel, FilterSection, ToolbarRow, activeChips, emptyFilterState, removeChip, type FilterState } from '../filter-panel'
import { useIsDesktop, useIsXs } from '../lib/use-media-query'
import { columnsFromModel } from '../live/columns-from-model'
import { stateToText, textToState } from '../live/filter-string'
import { recordKey, recordTitleField } from '../live/model-helpers'
import { humanize } from '../live/naming'
import { useFilterConfig } from '../live/use-filter-config'
import { useLiveRows } from '../live/use-live-rows'
import { widgetFields } from '../live/view-fields'
import { Button, buttonClass } from '../primitives/button'
import { Sheet } from '../primitives/sheet'
import { useDeleteFlow, type DeleteTarget } from './delete/use-delete-flow'
import { useRestore } from './delete/use-restore'
import { createOffered } from './create/create-offered'
import { ErrorBanner } from './error-banner'
import { ImportButton } from './import/import-button'
import { exportOffered, exportsSelection } from './export/export-options'
import { useExportFlow } from './export/use-export-flow'
import { ListEmpty } from './list-empty'
import { listEmptyState } from './list-empty-state'
import { ListCards } from './displays/list-cards'
import { MapDisplay } from './displays/map-display'
import { BoardDisplay } from './displays/board-display'
import { boardRank } from './displays/board-columns'
import { CalendarDisplay } from './displays/calendar-display'
import { TimelineDisplay } from './displays/timeline-display'
import { CustomDisplay } from './displays/custom-display'
import { DisplaySwitch, SortMenu } from './displays/display-controls'
import { displayRow, listDisplayChoices, loadedFields, shownListDisplay } from './displays/list-displays'
import { useSeedRecord } from './record-preview'
import { useDisplayRows } from './displays/use-display-rows'
import { useListScroll } from './list-scroll'
import { ListChart } from './list-chart'
import { ListGroupChart } from './list-group-chart'
import { parseSort, sortToOrderBy } from './list-order'
import { ListSearch } from './list-search'
import { Notice, useAdminMeta, usePermissions } from './meta-gate'
import { can, rowAllows } from './permissions'
import { listedResource } from './current-address'
import { navItemId } from './nav-from-meta'
import { AppLink, useAppAddress, type ListAddress } from './use-app-address'
import { withFieldTypeCells } from './field-types/field-type-cells'
import { withRelationTitleCells } from './titles/relation-title-cells'
import { useRecordTitle } from './titles/record-titles'
import { relatedColumnLoads } from './related-dots/dot-card'
import { withRelatedDotsColumns } from './related-dots/related-dots-columns'
import { useProjectUi } from './pages/project-ui'
import { SavedList } from './saved/saved-list'
import { facetNames, filterChips } from './searches/saved-search'
import { SaveSearchButton } from './searches/save-search-button'
import { SavedSearches } from './searches/saved-searches'
import { SignInPrompt } from '../auth/sign-in-prompt'
import { useListCellEditor } from './list-edit/use-list-cell-editor'
import { useListActions } from './list-actions/use-list-actions'
import { dragsRank, listHandOrder } from './hand-order/hand-order'
import { HandSortedList } from './hand-order/hand-sorted-list'
import { ReorderButton } from './hand-order/reorder-button'
import { listColumnNames } from '../live/columns-from-model'
import { text as appText } from './messages'
import { text } from './list-messages'

const where = createWhere()
const searchText = (extras: FilterExpr[]) => extras.find((clause) => clause.kind === 'search')

/**
 * A resource's list: its rows, with `listOf` the records its relation points at (`SavedList`), or with `searchesOf` the
 * user's saved searches and what each finds (`SavedSearches`). A visitor who cannot see the resource is told what
 * signing in gives, when its view says (`SignInPrompt`).
 */
export const ListPage = ({ address }: { address: ListAddress }) => {
  const { resources, views, signIn } = useAdminMeta()
  const model = resources[address.resource]
  const prompt = signIn?.[address.resource]
  if (!model) return prompt ? <SignInPrompt as="page" prompt={prompt.signIn} /> : <Notice title={appText('notFound')}>{appText('noResource', address.resource)}</Notice>
  const view = viewOfList(views[address.resource], address.list)
  if (address.list !== undefined && !view) return <Notice title={appText('notFound')}>{text('noList', address.list)}</Notice>
  if (view?.searchesOf) return <SavedSearches model={model} view={view} />
  const listed = listedResource(resources, views, address.resource, address.list)
  if (view && listed.listOf) {
    const target = listed.model!
    return (
      <SavedList model={model} view={view} target={target}>
        {(scope) => <LoadedList model={target} address={address} scope={scope} heading={{ title: view.names?.plural ?? humanize(model.name), subtitle: view.help }} />}
      </SavedList>
    )
  }
  return <LoadedList model={model} address={address} />
}

type LoadedListProps = {
  model: ResourceModel
  address: ListAddress
  /** A filter every load adds to the address's, which the address never shows: the records among the user's saved ones. */
  scope?: FilterExpr
  /** The title and the line under it, instead of the view's; the list of saved records takes its own resource's. */
  heading?: { title: string; subtitle?: string }
}

const LoadedList = ({ model, address, scope, heading }: LoadedListProps) => {
  const meta = useAdminMeta()
  const { set, listTo, go, href } = useAppAddress()
  const resource = model.name
  const view = viewOfList(meta.views[resource], address.list)
  const fields = useMemo(() => widgetFields(view, model), [view, model])
  const { fields: fieldTypes } = useProjectUi()
  const columns = useMemo(() => withRelatedDotsColumns(withRelationTitleCells(withFieldTypeCells(columnsFromModel(model, view), model, view, fieldTypes), model, meta.resources, meta.views), model, view, meta.resources, meta.views), [model, view, fieldTypes, meta.resources, meta.views])

  const filterText = address.filter
  const parsed = useMemo(() => textToState(fields, filterText), [fields, filterText])
  const state: FilterState = parsed.ok ? parsed.state : emptyFilterState
  const extras = parsed.ok ? parsed.extras : []
  const { orderBy, filterLayout: layout } = address
  const desktop = useIsDesktop()
  const xs = useIsXs()
  const [sheetOpen, setSheetOpen] = useState(false)

  const scoped = scope ? [...extras, scope] : extras
  const titleOf = useRecordTitle()
  const config = useFilterConfig({ model, resources: meta.resources, views: meta.views, view, state, extras: scoped, titleOf })
  const loadFilter = scope ? stateToText(fields, state, scoped) : parsed.ok ? filterText : ''
  // One load serves the table and every display, labelled for the relations any of them shows
  const loaded = useMemo(() => loadedFields(model, view, columns.map((column) => column.id)), [model, view, columns])
  const related = useMemo(() => relatedColumnLoads(view, meta.resources, meta.views, loaded), [view, meta.resources, meta.views, loaded])
  const rows = useLiveRows({ resources: meta.resources, views: meta.views, model, columns: loaded, filter: loadFilter, orderBy, related })
  const display = shownListDisplay(model, view, address.display)
  const permissions = usePermissions(resource)
  // Reordering by hand shows every record in their order, so neither a saved list's scope nor the filters apply
  const handOrder = scope ? undefined : listHandOrder(model, permissions)
  const [sorting, setSorting] = useState(false)
  const handSorting = sorting && handOrder !== undefined
  // A list that turns `drag.rank` on drags its table's rows while it shows them all in their order, without Reorder
  const dragging = !display && !handSorting && dragsRank(view, handOrder, orderBy, loadFilter)
  // The table, the cards, a board, a calendar, a timeline, a custom display and the records sorted by hand are as tall as all their rows and
  // scroll with the page; the map fills the screen
  const pageScroll = handSorting || display?.kind !== 'map'
  usePageScroll(pageScroll)
  // A custom display pages through the rows with `loadMore`; the table and cards scroll through them, and the map asks
  // for the records in its view
  const displayRows = useDisplayRows(model, rows.page, rows.key, display?.kind === 'custom')
  const scroll = useListScroll()

  const titleField = recordTitleField(model, view)
  const target = (row: GridRow): DeleteTarget => ({
    key: row.id,
    title: String(typeof row[titleField] === 'object' ? (row[titleField] as { name?: unknown }).name : (row[titleField] ?? row.id)),
    etag: typeof row.etag === 'string' ? row.etag : undefined,
    snapshot: row,
  })
  const singular = view?.names?.singular ?? humanize(resource)
  const cellEditing = useListCellEditor(model, view, permissions)
  const { state: auth } = useAuth()
  const restore = useRestore(model)
  const remove = useDeleteFlow({ model, view, restore, onReview: (deleted) => go({ kind: 'record', resource, key: deleted.key }) })
  // The view's named actions join the row menu and the selection's; a named delete stands in for the row's own Delete
  const named = useListActions(model)
  const namedDelete = view?.actions.some((action) => action.run?.kind === 'delete') ?? false

  const setFilter = (next: FilterState, nextExtras = extras) => set({ filter: stateToText(fields, next, nextExtras) })
  const search = searchText(extras)
  const commitSearch = (text: string) => {
    const others = extras.filter((clause) => clause.kind !== 'search')
    setFilter(state, text ? [...others, where.search(text)] : others)
  }
  const plural = view?.names?.plural ?? humanize(resource)
  // A calendar and a timeline are in time order, and a board of ranked records in their rank, so none has a sort
  const sorted = display?.kind === 'calendar' || display?.kind === 'timeline' || (display?.kind === 'board' && boardRank(model)) ? undefined : display
  const sortMenu = sorted && <SortMenu model={model} view={view} display={sorted} orderBy={orderBy} onChange={(next) => set({ orderBy: next })} />
  const searchBox = model.search?.length ? <ListSearch value={search?.kind === 'search' ? search.text : ''} onCommit={commitSearch} placeholder={text('searchPlural', plural)} className={desktop ? undefined : 'min-h-11'} /> : null
  // On a desktop the sort, the filters and the search share one row below the title; a phone has the filters button
  // beside the search, and the sort in the filters sheet
  // The side panel layout leaves the sort and the search in a row of their own
  const panel = <FilterPanel layout={layout} config={config} value={state} onChange={setFilter} leading={layout === 'bar' ? sortMenu : undefined} trailing={searchBox} />
  const desktopToolbar = layout === 'bar' ? panel : <ToolbarRow groups={[sortMenu ? [sortMenu] : []]} trailing={searchBox} />
  const chips = activeChips(config, state)
  const chipsRow = <ActiveFilterChips scroll chips={chips} onRemove={(key) => setFilter(removeChip(state, key))} onClear={() => setFilter(emptyFilterState)} />
  const phoneSort = sorted && (
    <FilterSection title={text('sort')}>
      <SortMenu model={model} view={view} display={sorted} orderBy={orderBy} onChange={(next) => set({ orderBy: next })} className="min-h-11 w-full" />
    </FilterSection>
  )
  const phoneFilters = (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <Button className="min-h-11" onClick={() => setSheetOpen(true)} aria-haspopup="dialog">
          <SlidersHorizontal className="size-3.5" />
          {chips.length > 0 ? text('filtersCount', chips.length) : text('filters')}
        </Button>
        {searchBox ?? <div className="min-w-0 flex-1">{chipsRow}</div>}
      </div>
      {searchBox && chipsRow}
      <Sheet title={text('filters')} open={sheetOpen} onClose={() => setSheetOpen(false)}>
        <FilterPanel layout="panel" fullWidth config={config} value={state} onChange={setFilter} leading={phoneSort} />
      </Sheet>
    </div>
  )
  const createButton = !scope && createOffered(view, meta.pages, permissions) && (
    <AppLink to={{ kind: 'create', resource }} className={buttonClass({ variant: 'primary' })}>
      <Plus className="size-3.5" />
      {text('newRecord', singular)}
    </AppLink>
  )
  // A filtered list can be saved as a search, which shows what it filters on as the chips read
  const saveSearch = view?.saveSearch && !scope && parsed.ok && filterText && (
    <SaveSearchButton model={model} view={view} search={view.saveSearch} filter={filterText} chips={filterChips(model, view, filterText, facetNames(config))} />
  )
  const importButton = !scope && <ImportButton model={model} />
  const exportFlow = useExportFlow({ model, view, resources: meta.resources, views: meta.views, plural, filter: loadFilter, orderBy })
  // On mobile the button is its icon alone, so that the title's buttons keep to one row
  const exportButton = exportOffered(view) && (
    <Button onClick={() => exportFlow.open()} {...(!desktop && { 'aria-label': text('export'), title: text('export') })}>
      <Download className="size-3.5" />
      {desktop && text('export')}
    </Button>
  )
  const sortButton = handOrder && !dragging && <ReorderButton sorting={handSorting} onChange={setSorting} iconOnly={!desktop} />
  const displaySwitch = (menu: boolean) => !handSorting && <DisplaySwitch view={view} choices={listDisplayChoices(model, view, xs)} value={display?.name ?? tableDisplay} onChange={(name) => set({ display: name })} menu={menu} />

  const seedRecord = useSeedRecord(model)
  const openRecord = (row: GridRow) => {
    seedRecord(displayRow(model, row).record)
    go({ kind: 'record', resource, key: recordKey(model, row) })
  }
  const recordLink = (row: GridRow) => ({ href: href({ kind: 'record', resource, key: recordKey(model, row) }), onFollow: () => openRecord(row) })

  const table = rows.source ? (
    <DataGrid
      columns={columns}
      source={rows.source}
      sort={parseSort(orderBy)}
      onSortChange={(sort) => set({ orderBy: sortToOrderBy(sort) })}
      onOpenRow={openRecord}
      rowLink={recordLink}
      cellEditor={cellEditing.editor}
      rowPatches={cellEditing.patches}
      initialScrollIndex={scroll.initialIndex}
      onScrollIndex={scroll.remember}
      rowActions={[
        { label: text('openRecord', singular), onSelect: openRecord },
        ...named.rowActions,
        ...(can(permissions, 'delete') && !namedDelete ? [{ label: text('delete'), destructive: true, available: (row: GridRow) => rowAllows(row, 'delete'), onSelect: (row: GridRow) => void remove.start(target(row)) }] : []),
      ]}
      bulkActions={[
        ...(exportOffered(view) && exportsSelection(model) ? [{ label: (count: number) => text('exportCount', count), onRun: (rows: GridRow[]) => exportFlow.open(rows) }] : []),
        ...named.bulkActions,
        ...(can(permissions, 'delete') ? [{ label: (count: number) => text('deleteCount', count), destructive: true, onRun: (rows: GridRow[]) => remove.startBulk(rows.map(target)) }] : []),
      ]}
      rowNumbers={false}
      pinKey={auth.kind === 'signed-in' ? pinnedStorageKey(auth.user.id, navItemId(resource, address.list)) : undefined}
      scroll="parent"
      className="flex-1"
    />
  ) : (
    <div className="flex-1 rounded-lg border bg-surface" />
  )
  const cardsList = { ...rows, initialIndex: scroll.initialIndex, onScrollIndex: scroll.remember }
  // A list without rows says why, and offers to clear what narrows it or to create the first record
  const emptyState = listEmptyState({
    plural,
    search: search?.kind === 'search' ? search.text : '',
    filtered: chips.length > 0,
    scoped: Boolean(scope) || extras.some((clause) => clause.kind !== 'search'),
    canCreate: Boolean(createButton),
  })
  const empty = <ListEmpty state={emptyState} onClearSearch={() => commitSearch('')} onClearFilters={() => setFilter(emptyFilterState)} create={createButton} />
  const drawDisplay = () => {
    if (dragging) return <HandSortedList model={model} view={view} field={handOrder!} filter="" columns={listColumnNames(model, view)} sort={{ value: parseSort(orderBy), onChange: (sort) => set({ orderBy: sortToOrderBy(sort) }) }} />
    if (!display) return rows.source?.total === 0 && !rows.error ? empty : table
    // A change of filter or sort starts the cards again at the top
    if (display.kind === 'cards') return <ListCards key={rows.key.join(' ')} model={model} view={view} display={display} list={cardsList} empty={empty} />
    if (display.kind === 'map') {
      return <MapDisplay model={model} view={view} display={display} filter={loadFilter} orderBy={orderBy} fields={loaded} at={address.map} onMove={(map) => set({ map })} flush />
    }
    if (display.kind === 'board') return <BoardDisplay model={model} view={view} display={display} fields={loaded} filter={loadFilter} orderBy={orderBy} />
    if (display.kind === 'calendar') return <CalendarDisplay model={model} view={view} display={display} fields={loaded} filter={loadFilter} at={address.calendar} linkTo={(calendar) => listTo({ calendar })} />
    if (display.kind === 'timeline') return <TimelineDisplay model={model} view={view} display={display} fields={loaded} filter={loadFilter} at={address.timeline} linkTo={(timeline) => listTo({ timeline })} />
    return <CustomDisplay display={display} list={displayRows} />
  }
  const shown = handSorting ? (
    <div className="flex flex-col gap-3">
      <p className="text-muted-foreground">{text('dragToSort')}</p>
      <HandSortedList model={model} view={view} field={handOrder} filter="" columns={listColumnNames(model, view)} />
    </div>
  ) : (
    drawDisplay()
  )

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 px-5 py-4">
      {remove.dialogs}
      {exportFlow.dialogs}
      {named.prompt}
      <PageHeader
        title={heading?.title ?? plural}
        subtitle={heading ? heading.subtitle : view?.help}
        subtitleBelow
        actions={
          <>
            {displaySwitch(!desktop)}
            {sortButton}
            {saveSearch}
            {importButton}
            {exportButton}
            {createButton}
          </>
        }
      />
      {!parsed.ok && <ErrorBanner title={text('unreadableFilter')} error={new Error(parsed.errors.map((error) => error.message).join('; '))} />}
      {rows.error && !display && !handSorting && <ErrorBanner title={text('couldNotLoadRows')} error={rows.error} />}
      {view?.chart &&
        !handSorting &&
        (isGroupChart(view.chart) ? (
          <ListGroupChart model={model} view={view} chart={view.chart} plural={plural} filter={loadFilter} />
        ) : (
          <ListChart resource={resource} chart={view.chart} title={text('created', plural)} noun={plural.toLowerCase()} filter={loadFilter} />
        ))}
      {!handSorting && (desktop ? desktopToolbar : phoneFilters)}
      {desktop && layout === 'panel' && !handSorting ? (
        <div className="flex min-h-0 flex-1 gap-4">
          {/* The same element either way, so that switching displays keeps the panel's state; it stays in view while the page scrolls */}
          <div className={pageScroll ? 'sticky top-[calc(var(--pb-sticky-top,0px)+1rem)] flex max-h-[calc(100dvh-var(--pb-sticky-top,0px)-var(--pb-sticky-bottom,0px)-2rem)] shrink-0 self-start' : 'flex shrink-0'}>{panel}</div>
          {shown}
        </div>
      ) : (
        shown
      )}
    </div>
  )
}
