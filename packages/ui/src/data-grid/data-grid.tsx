import { useTable, type SortingState } from '@tanstack/react-table'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { cn } from '../lib/cn'
import type { ColumnSpec, GridRow } from './column-spec'
import { buildColumns, features } from './columns'
import { GridFooter, type BulkAction } from './grid-footer'
import { RowMenu, availableActions, type RowAction } from './row-menu'
import { compactGutter, desktopMinScale, gridMinWidth, gutterWidthFor, rowMenuWidth } from './grid-template'
import { useHorizontalScroll } from './use-horizontal-scroll'
import { usePinnedColumns } from './use-pinned-columns'
import { useIsDesktop } from '../lib/use-media-query'
import { GridHeader } from './grid-header'
import { DataRow, SkeletonRow } from './grid-row'
import type { RowSource } from './row-source'
import { usePagedRows } from './use-paged-rows'
import { useVirtualRows } from './use-virtual-rows'
import { useCellEditing, type CellEditor } from './use-cell-editing'
import { ReorderRows, SortableRow, type RowReorder } from './row-reorder'

export type DataGridProps = {
  columns: ColumnSpec[]
  source: RowSource
  /** The order in which `source` yields rows; sorting the other way flips the index mapping. */
  naturalSort?: { columnId: string; direction: 'asc' | 'desc' }
  initialScrollIndex?: number
  /** Called with the first row in view as it changes, to come back to it with `initialScrollIndex`. */
  onScrollIndex?: (index: number) => void
  /** Simulated page load time for mock sources. 0 loads synchronously. */
  latencyMs?: number
  /** Controlled sorting, for sources that sort on the server. Without it, sorting flips the mock source. */
  sort?: { columnId: string; direction: 'asc' | 'desc' }
  onSortChange?: (sort: { columnId: string; direction: 'asc' | 'desc' }) => void
  onOpenRow?: (row: GridRow) => void
  /** Entries of the "..." menu at the end of each row; a row none apply to gets no menu, but keeps the column. */
  rowActions?: RowAction[]
  /** Cells edited in place, between which the arrow keys and Tab move. */
  cellEditor?: CellEditor
  /** Values to show over the loaded rows', by row id, such as those of edits saving or saved since the rows loaded. */
  rowPatches?: ReadonlyMap<string, Partial<GridRow>>
  /** Buttons shown next to the selection count, run on the selected rows. */
  bulkActions?: BulkAction[]
  /** Where to remember pinned columns in local storage, for example one key per user and resource. */
  pinKey?: string
  /** Show the row number next to the checkbox; without it the selection column is a narrow strip. */
  rowNumbers?: boolean
  /** Columns pinned until the user chooses otherwise. */
  defaultPinned?: string[]
  compact?: boolean
  selectable?: boolean
  /** Rows moved by a drag handle in place of the checkbox, every row of `source` loaded; nothing is selected meanwhile. */
  reorder?: RowReorder
  /** Sized to show every row of `source` without scrolling and without the footer, for a few rows shown whole. */
  fit?: boolean
  /**
   * What scrolls the rows: `own`, a scroller of the grid's own in the height it is given, or `parent`, the nearest
   * scrolling ancestor or else the page, the grid as tall as all its rows with its header and footer sticky in it.
   */
  scroll?: 'own' | 'parent'
  className?: string
}

const headerHeight = 32

export const DataGrid = ({ columns: given, source, naturalSort, initialScrollIndex = 0, onScrollIndex, latencyMs = 150, sort: controlledSort, onSortChange, onOpenRow, rowActions, cellEditor, rowPatches, bulkActions, pinKey, defaultPinned, rowNumbers = true, compact = false, selectable: selecting = true, reorder, fit = false, scroll = 'own', className }: DataGridProps) => {
  const selectable = selecting && !reorder
  const rowHeight = compact ? 28 : 36
  const [pinned, setPinned] = usePinnedColumns(pinKey, defaultPinned)
  const columns = useMemo(() => {
    const first = pinned.flatMap((id) => given.find((spec) => spec.id === id) ?? [])
    return [...first, ...given.filter((spec) => !pinned.includes(spec.id))]
  }, [given, pinned])
  const pinnedIds = columns.slice(0, columns.filter((spec) => pinned.includes(spec.id)).length).map((spec) => spec.id)
  const { total } = source
  const [localSorting, setLocalSorting] = useState<SortingState>(naturalSort ? [{ id: naturalSort.columnId, desc: naturalSort.direction === 'desc' }] : [])
  const sorting: SortingState = controlledSort ? [{ id: controlledSort.columnId, desc: controlledSort.direction === 'desc' }] : localSorting
  const setSorting = (updater: SortingState | ((current: SortingState) => SortingState)) => {
    const next = typeof updater === 'function' ? updater(sorting) : updater
    const first = next[0]
    if (onSortChange && first) onSortChange({ columnId: first.id, direction: first.desc ? 'desc' : 'asc' })
    if (!controlledSort) setLocalSorting(next)
  }
  const [rowSelection, setRowSelection] = useState({})
  const tableColumns = useMemo(() => buildColumns(columns), [columns])

  const sort = sorting[0]
  const reverse = Boolean(!controlledSort && naturalSort && sort && sort.id === naturalSort.columnId && (sort.desc ? 'desc' : 'asc') !== naturalSort.direction)
  const sourceRowAt = source.rowAt
  const rowAt = useCallback((index: number) => sourceRowAt!(reverse ? total - 1 - index : index), [sourceRowAt, reverse, total])

  const [startIndex] = useState(initialScrollIndex)
  const { ref, top, geometry, rows: virtualRows, first: firstIndex, last: lastIndex } = useVirtualRows<HTMLDivElement>({ total, rowHeight, initialIndex: startIndex, inset: headerHeight })
  const narrow = !useIsDesktop()
  const gutter = narrow || !rowNumbers ? compactGutter : gutterWidthFor(total)
  const topIndex = Math.floor(Math.max(0, top) / rowHeight)
  useEffect(() => onScrollIndex?.(topIndex), [topIndex, onScrollIndex])
  const getRow = usePagedRows({ total, rowAt: sourceRowAt ? rowAt : undefined, loadRows: source.loadRows, revision: source.revision, latencyMs }, firstIndex, lastIndex)

  const patchedRow = useCallback((index: number) => {
    const row = getRow(index)
    const patch = row && rowPatches?.get(row.id)
    return patch ? { ...row, ...patch } : row
  }, [getRow, rowPatches])
  const loaded = virtualRows.map(({ index, offset }) => ({ index, offset, row: patchedRow(index) }))
  const data = useMemo(() => loaded.flatMap(({ row }) => (row ? [row] : [])), [patchedRow, firstIndex, lastIndex])
  const table = useTable({
    features,
    columns: tableColumns,
    data,
    state: { sorting, rowSelection },
    onSortingChange: setSorting,
    onRowSelectionChange: setRowSelection,
    manualSorting: true,
    enableMultiSort: false,
    enableSortingRemoval: false,
    getRowId: (row) => row.id,
  })
  const tableRows = new Map(table.getRowModel().rows.map((row) => [row.id, row]))
  const selectedCount = Object.keys(rowSelection).length
  const selectedRows = useRef(new Map<string, GridRow>())
  for (const row of table.getRowModel().rows) if (row.getIsSelected()) selectedRows.current.set(row.id, row.original)
  const trailing = rowActions && rowActions.length > 0 ? rowMenuWidth : 0
  const minScale = narrow ? 1 : desktopMinScale
  const horizontal = useHorizontalScroll()
  // The header scrolls sideways with the rows, outside them so that it can stick to the top of a page
  const headerRef = useRef<HTMLDivElement>(null)
  const onBodyScroll = () => {
    horizontal.onScroll()
    if (headerRef.current && horizontal.ref.current) headerRef.current.scrollLeft = horizontal.ref.current.scrollLeft
  }
  const [pins, setPins] = useState<Record<string, number>>({})
  useLayoutEffect(() => {
    const header = headerRef.current?.querySelector('[role=row]')
    if (!header) return
    let left = gutter
    const next: Record<string, number> = {}
    for (const id of pinnedIds) {
      next[id] = left
      left += header.querySelector<HTMLElement>(`[data-col-id="${id}"]`)?.offsetWidth ?? 0
    }
    if (JSON.stringify(pins) !== JSON.stringify(next)) setPins(next)
  })
  const lastPinned = pinnedIds.at(-1)
  const togglePin = (id: string) => setPinned(pinned.includes(id) ? pinned.filter((entry) => entry !== id) : [...pinned, id])

  const headerCells = table.getHeaderGroups().flatMap((group) =>
    group.headers.map((header) => ({
      spec: columns.find((spec) => spec.id === header.column.id)!,
      sorted: header.column.getIsSorted(),
      onSort: (event: unknown) => header.column.getToggleSortingHandler()?.(event),
    })),
  )

  const gridRef = useRef<HTMLDivElement>(null)
  const columnIds = useMemo(() => columns.map((spec) => spec.id), [columns])
  const cellEditing = useCellEditing({ editor: cellEditor, columns: columnIds, total, rowAt: patchedRow, onOpenRow, container: gridRef })

  const minWidth = gridMinWidth(columns, gutter, trailing, minScale)
  const own = scroll === 'own'
  const header = (
    <div ref={headerRef} className={cn('sticky z-20 shrink-0 overflow-hidden', own ? 'top-0' : 'top-[var(--pb-sticky-top,0px)]')}>
      <div style={{ minWidth }}>
        <GridHeader cells={headerCells} specs={columns} gutter={gutter} trailing={trailing} minScale={minScale} pins={pins} lastPinned={lastPinned} scrolled={horizontal.scrolled} onTogglePin={togglePin} selectable={selectable} selectedCount={selectedCount} onClearSelection={() => setRowSelection({})} />
      </div>
    </div>
  )
  const rowsInView = loaded.map(({ index, offset, row }) => {
    const frame = { specs: columns, gutter, index, offset, height: rowHeight, selectable, trailing, minScale, scrolled: horizontal.scrolled, pins, lastPinned }
    const tableRow = row ? tableRows.get(row.id) : undefined
    if (!tableRow || !row) return <SkeletonRow key={`skeleton-${index}`} {...frame} />
    const actions = trailing ? availableActions(rowActions!, row) : []
    const props = {
      ...frame,
      selected: tableRow.getIsSelected(),
      onToggle: () => tableRow.toggleSelected(),
      onOpen: onOpenRow ? () => onOpenRow(row) : undefined,
      menu: actions.length > 0 ? <RowMenu row={row} actions={actions} /> : undefined,
      cells: tableRow.getAllCells().map((cell) => {
        const content = <table.FlexRender cell={cell} />
        return { spec: columns.find((spec) => spec.id === cell.column.id)!, ...(cellEditing ? cellEditing.cell(index, row, cell.column.id, content) : { content }) }
      }),
    }
    return reorder ? <SortableRow key={row.id} {...props} row={row} label={reorder.label(row)} /> : <DataRow key={row.id} {...props} />
  })
  const body = (
    <div ref={horizontal.attach} onScroll={onBodyScroll} className="overflow-x-auto overflow-y-hidden overscroll-x-contain [-webkit-overflow-scrolling:touch]">
      <div ref={ref} className="relative" style={{ minWidth, height: geometry.contentHeight }}>
        {reorder ? (
          <ReorderRows ids={Array.from({ length: total }, (_, index) => patchedRow(index)?.id ?? `missing-${index}`)} rowAt={patchedRow} reorder={reorder}>
            {rowsInView}
          </ReorderRows>
        ) : (
          rowsInView
        )}
      </div>
    </div>
  )

  return (
    <div
      ref={gridRef}
      role="grid"
      aria-rowcount={total}
      onKeyDown={cellEditing?.onKeyDown}
      className={cn('flex flex-col rounded-lg border bg-background', own ? 'min-h-0 overflow-hidden' : 'overflow-clip', className)}
      style={fit && own ? { height: headerHeight + total * rowHeight + 2 } : undefined}
    >
      <div className={cn('relative', own && 'flex min-h-0 flex-1 flex-col')}>
        {own ? (
          <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden">
            {header}
            {body}
          </div>
        ) : (
          <>
            {header}
            {body}
          </>
        )}
        {horizontal.more && <div aria-hidden className="pointer-events-none absolute inset-y-0 right-0 z-20 w-8 bg-gradient-to-l from-backdrop/15 to-transparent" />}
      </div>
      {!fit && (
        <GridFooter
          total={total}
          className={own ? undefined : 'sticky bottom-[var(--pb-sticky-bottom,0px)] z-20'}
          selectedCount={selectedCount}
          bulkActions={bulkActions?.map((action) => ({
            label: action.label(selectedCount),
            destructive: action.destructive,
            onRun: () => {
              action.onRun(Object.keys(rowSelection).flatMap((id) => selectedRows.current.get(id) ?? []))
              setRowSelection({})
              selectedRows.current.clear()
            },
          }))}
        />
      )}
    </div>
  )
}
