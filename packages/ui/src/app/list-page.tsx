import { Plus, SlidersHorizontal } from 'lucide-react'
import { useMemo, useState } from 'react'
import { createWhere, encodeKey, type FilterExpr, type ResourceModel } from '@protobase/schema'
import { PageHeader } from '../app-shell'
import { useAuth } from '../auth'
import { DataGrid, pinnedStorageKey, type GridRow } from '../data-grid'
import { ActiveFilterChips, FilterPanel, activeChips, emptyFilterState, removeChip, type FilterState } from '../filter-panel'
import { useIsDesktop } from '../lib/use-media-query'
import { columnsFromModel } from '../live/columns-from-model'
import { stateToText, textToState } from '../live/filter-string'
import { recordTitleField } from '../live/model-helpers'
import { humanize } from '../live/naming'
import { useFilterConfig } from '../live/use-filter-config'
import { useLiveRows } from '../live/use-live-rows'
import { widgetFields } from '../live/view-fields'
import { Button } from '../primitives/button'
import { Sheet } from '../primitives/sheet'
import { useDeleteFlow, type DeleteTarget } from './delete/use-delete-flow'
import { useRestore } from './delete/use-restore'
import { ErrorBanner } from './error-banner'
import { ListChart } from './list-chart'
import { defaultOrderBy, parseSort, sortToOrderBy } from './list-order'
import { ListSearch } from './list-search'
import { Notice, useAdminMeta, usePermissions } from './meta-gate'
import { can, rowAllows } from './permissions'
import { useRouter } from './router'

const where = createWhere()
const searchText = (extras: FilterExpr[]) => extras.find((clause) => clause.kind === 'search')

export const ListPage = ({ resource }: { resource: string }) => {
  const { resources } = useAdminMeta()
  const model = resources[resource]
  if (!model) return <Notice title="Not found">There is no resource called {resource}.</Notice>
  return <LoadedList model={model} />
}

const LoadedList = ({ model }: { model: ResourceModel }) => {
  const meta = useAdminMeta()
  const { params, setParams, navigate } = useRouter()
  const resource = model.name
  const view = meta.views[resource]
  const fields = useMemo(() => widgetFields(view, model), [view, model])
  const columns = useMemo(() => columnsFromModel(model, view), [model, view])

  const filterText = params.get('filter') ?? ''
  const parsed = useMemo(() => textToState(fields, filterText), [fields, filterText])
  const state: FilterState = parsed.ok ? parsed.state : emptyFilterState
  const extras = parsed.ok ? parsed.extras : []
  const orderBy = params.get('order_by') ?? defaultOrderBy(model, view)
  const layout = params.get('layout') === 'panel' ? 'panel' : 'bar'
  const desktop = useIsDesktop()
  const [sheetOpen, setSheetOpen] = useState(false)

  const config = useFilterConfig({ model, resources: meta.resources, views: meta.views, view, state, extras })
  const rows = useLiveRows({ resources: meta.resources, views: meta.views, model, columns: columns.map((column) => column.id), filter: parsed.ok ? filterText : '', orderBy })

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
  const remove = useDeleteFlow({ model, view, restore, onReview: (deleted) => navigate(`/${resource}/${encodeURIComponent(deleted.key)}`) })

  const setFilter = (next: FilterState, nextExtras = extras) => setParams({ filter: stateToText(fields, next, nextExtras) || undefined })
  const search = searchText(extras)
  const commitSearch = (text: string) => {
    const others = extras.filter((clause) => clause.kind !== 'search')
    setFilter(state, text ? [...others, where.search(text)] : others)
  }
  const plural = view?.names?.plural ?? humanize(resource)
  const panel = <FilterPanel layout={layout} config={config} value={state} onChange={setFilter} />
  const chips = activeChips(config, state)
  const phoneFilters = (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <Button className="min-h-11" onClick={() => setSheetOpen(true)} aria-haspopup="dialog">
          <SlidersHorizontal className="size-3.5" />
          Filters{chips.length > 0 && ` (${chips.length})`}
        </Button>
        <div className="min-w-0 flex-1">
          <ActiveFilterChips scroll chips={chips} onRemove={(key) => setFilter(removeChip(state, key))} onClear={() => setFilter(emptyFilterState)} />
        </div>
      </div>
      <Sheet title="Filters" open={sheetOpen} onClose={() => setSheetOpen(false)}>
        <FilterPanel layout="panel" fullWidth config={config} value={state} onChange={setFilter} />
      </Sheet>
    </div>
  )

  const grid = rows.source ? (
    <DataGrid
      columns={columns}
      source={rows.source}
      sort={parseSort(orderBy)}
      onSortChange={(sort) => setParams({ order_by: sortToOrderBy(sort) })}
      onOpenRow={(row) => navigate(`/${resource}/${encodeKey(row.id.split(','))}`)}
      rowActions={[
        { label: `Open ${singular.toLowerCase()}`, onSelect: (row) => navigate(`/${resource}/${encodeKey(row.id.split(','))}`) },
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

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 px-5 py-4">
      {remove.dialogs}
      <PageHeader
        title={plural}
        subtitle={view?.help}
        actions={
          <>
            {model.search?.length ? <ListSearch value={search?.kind === 'search' ? search.text : ''} onCommit={commitSearch} placeholder={`Search ${plural.toLowerCase()}`} /> : null}
            {can(permissions, 'create') && (
              <Button variant="primary" onClick={() => navigate(`/${resource}/new`)}>
                <Plus className="size-3.5" />
                New {singular.toLowerCase()}
              </Button>
            )}
          </>
        }
      />
      {!parsed.ok && <ErrorBanner title="The filter in the address could not be read" error={new Error(parsed.errors.map((error) => error.message).join('; '))} />}
      {rows.error && <ErrorBanner title="Could not load rows" error={rows.error} />}
      {view?.chart && <ListChart resource={resource} chart={view.chart} title={`${plural} created`} noun={plural.toLowerCase()} filter={parsed.ok ? filterText : ''} />}
      {!desktop ? phoneFilters : layout === 'bar' && panel}
      {desktop && layout === 'panel' ? (
        <div className="flex min-h-0 flex-1 gap-4">
          {panel}
          {grid}
        </div>
      ) : (
        grid
      )}
    </div>
  )
}
