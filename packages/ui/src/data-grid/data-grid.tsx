import { useVirtualizer } from '@tanstack/react-virtual'
import { useTable, type SortingState } from '@tanstack/react-table'
import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react'
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
import { useGridScroll } from './use-grid-scroll'
import { usePagedRows } from './use-paged-rows'
import { windowFor } from './geometry'

export type DataGridProps = {
  columns: ColumnSpec[]
  source: RowSource
  /** The order in which `source` yields rows; sorting the other way flips the index mapping. */
  naturalSort?: { columnId: string; direction: 'asc' | 'desc' }
  initialScrollIndex?: number
  /** Simulated page load time for mock sources. 0 loads synchronously. */
  latencyMs?: number
  /** Controlled sorting, for sources that sort on the server. Without it, sorting flips the mock source. */
  sort?: { columnId: string; direction: 'asc' | 'desc' }
  onSortChange?: (sort: { columnId: string; direction: 'asc' | 'desc' }) => void
  onOpenRow?: (row: GridRow) => void
  /** Entries of the "..." menu at the end of each row; a row none apply to gets no menu, but keeps the column. */
  rowActions?: RowAction[]
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
  className?: string
}

const headerHeight = 32

export const DataGrid = ({ columns: given, source, naturalSort, initialScrollIndex = 0, latencyMs = 150, sort: controlledSort, onSortChange, onOpenRow, rowActions, bulkActions, pinKey, defaultPinned, rowNumbers = true, compact = false, selectable = true, className }: DataGridProps) => {
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

  const { ref, onScroll, viewport, top, geometry } = useGridScroll(total, rowHeight, initialScrollIndex)
  const narrow = !useIsDesktop()
  const gutter = narrow || !rowNumbers ? compactGutter : gutterWidthFor(total)
  const bodyHeight = Math.max(0, viewport - headerHeight)
  const bodyRef = useRef<HTMLDivElement>(null)
  const offsetListener = useRef<((offset: number, scrolling: boolean) => void) | null>(null)
  const { base, count } = windowFor(total, top, rowHeight)
  const localOffset = top - base * rowHeight

  const virtualizer = useVirtualizer({
    count,
    getScrollElement: () => bodyRef.current,
    estimateSize: () => rowHeight,
    overscan: 6,
    initialRect: { width: 0, height: bodyHeight },
    observeElementOffset: (_, callback) => {
      offsetListener.current = callback
      callback(localOffset, false)
      return () => {
        offsetListener.current = null
      }
    },
  })
  useLayoutEffect(() => offsetListener.current?.(localOffset, false), [localOffset, base])

  const items = virtualizer.getVirtualItems()
  const firstIndex = base + (items[0]?.index ?? 0)
  const lastIndex = base + (items[items.length - 1]?.index ?? 0)
  const getRow = usePagedRows({ total, rowAt: sourceRowAt ? rowAt : undefined, loadRows: source.loadRows, latencyMs }, firstIndex, lastIndex)

  const loaded = items.map((item) => ({ item, index: base + item.index, row: getRow(base + item.index) }))
  const data = useMemo(() => loaded.flatMap(({ row }) => (row ? [row] : [])), [getRow, firstIndex, lastIndex])
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
  const [pins, setPins] = useState<Record<string, number>>({})
  useLayoutEffect(() => {
    const header = horizontal.ref.current?.querySelector('[role=row]')
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

  const visibleRows = Math.max(1, Math.floor(bodyHeight / rowHeight))
  const first = Math.min(total, Math.floor(top / rowHeight) + 1)
  const last = Math.min(total, first + visibleRows - 1)

  return (
    <div className={cn('flex min-h-0 flex-col overflow-hidden rounded-lg border bg-background', className)}>
      <div ref={ref} onScroll={onScroll} className="relative min-h-0 flex-1 overflow-y-auto overflow-x-hidden" role="grid" aria-rowcount={total}>
        <div style={{ height: geometry.contentHeight || undefined }}>
          <div className="sticky top-0" style={{ height: viewport }}>
            {viewport > 0 && (
              <>
                <div ref={horizontal.attach} onScroll={horizontal.onScroll} className="h-full overflow-x-auto overflow-y-hidden overscroll-x-contain [-webkit-overflow-scrolling:touch]">
                  <div className="flex h-full flex-col" style={{ minWidth: gridMinWidth(columns, gutter, trailing, minScale) }}>
                    <GridHeader cells={headerCells} specs={columns} gutter={gutter} trailing={trailing} minScale={minScale} pins={pins} lastPinned={lastPinned} scrolled={horizontal.scrolled} onTogglePin={togglePin} selectable={selectable} selectedCount={selectedCount} onClearSelection={() => setRowSelection({})} />
                    <div ref={bodyRef} className="relative min-h-0 flex-1 overflow-clip">
                      {loaded.map(({ item, index, row }) => {
                        const frame = { specs: columns, gutter, index, offset: item.start - localOffset, height: rowHeight, selectable, trailing, minScale, scrolled: horizontal.scrolled, pins, lastPinned }
                        const tableRow = row ? tableRows.get(row.id) : undefined
                        if (!tableRow) return <SkeletonRow key={`skeleton-${index}`} {...frame} />
                        const actions = trailing && row ? availableActions(rowActions!, row) : []
                        return (
                          <DataRow
                            key={row?.id}
                            {...frame}
                            selected={tableRow.getIsSelected()}
                            onToggle={() => tableRow.toggleSelected()}
                            onOpen={onOpenRow && row ? () => onOpenRow(row) : undefined}
                            menu={row && actions.length > 0 ? <RowMenu row={row} actions={actions} /> : undefined}
                            cells={tableRow.getAllCells().map((cell) => ({
                              spec: columns.find((spec) => spec.id === cell.column.id)!,
                              content: <table.FlexRender cell={cell} />,
                            }))}
                          />
                        )
                      })}
                    </div>
                  </div>
                </div>
                {horizontal.more && <div aria-hidden className="pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-foreground/15 to-transparent" />}
              </>
            )}
          </div>
        </div>
      </div>
      <GridFooter
        total={total}
        first={first}
        last={last}
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
    </div>
  )
}
