import { useCallback, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import type { GridRow, RowSource } from '../../data-grid'
import { usePagedRows } from '../../data-grid/use-paged-rows'
import { useVirtualRows } from '../../data-grid/use-virtual-rows'
import { Skeleton } from '../../primitives/skeleton'
import { anchoredTop, cardColumns, cardGap, cardWidth, recordRange, type CardLayout } from './card-layout'

type VirtualCardsProps = {
  source: RowSource
  label: string
  /** The record to start at. */
  initialIndex: number
  /** Called with the first record in view as it changes. */
  onScrollIndex: (index: number) => void
  /** The least height of a card of this width, used until the drawn cards are measured. */
  minHeight: (width: number) => number
  children: (row: GridRow) => ReactNode
}

/**
 * Cards in rows as wide as the list, scrolled like the table: only the rows in view are drawn, over a scroller that
 * holds any number of records, and the records are loaded in the table's pages, so a change of width keeps the loaded
 * pages and the first record in view. Every card in a width is as tall as the tallest drawn so far.
 */
export const VirtualCards = ({ source, label, initialIndex, onScrollIndex, minHeight, children }: VirtualCardsProps) => {
  const { total } = source
  const [width, setWidth] = useState(0)
  const columns = cardColumns(width)
  const itemWidth = cardWidth(width, columns)
  const [measured, setMeasured] = useState({ width: 0, height: 0 })
  const itemHeight = Math.ceil(Math.max(minHeight(itemWidth), measured.width === itemWidth ? measured.height : 0))
  const rowHeight = itemHeight + cardGap

  // Keep the same records in view across a change of columns or card height, and remember the first of them
  const layout: CardLayout = { columns, rowHeight }
  const anchor = useRef({ layout, top: 0 })
  const changed = anchor.current.layout.columns !== columns || anchor.current.layout.rowHeight !== rowHeight
  const settle = (top: number) => (changed ? anchoredTop(anchor.current.top, anchor.current.layout, layout) : top)
  const scroll = useVirtualRows({ total: Math.ceil(total / columns), rowHeight, initialIndex: Math.floor(initialIndex / columns), settle })
  useLayoutEffect(() => {
    if (changed) scroll.scrollTo(scroll.top)
    anchor.current = { layout, top: scroll.top }
    if (!changed) onScrollIndex(Math.floor(scroll.top / rowHeight) * columns)
  })
  const range = recordRange(scroll.first, scroll.last, columns, total)
  const getRow = usePagedRows({ total, rowAt: source.rowAt, loadRows: source.loadRows, latencyMs: 0 }, range.start, range.end)

  const bodyRef = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const body = bodyRef.current
    if (!body) return
    const observer = new ResizeObserver(() => setWidth(body.clientWidth))
    observer.observe(body)
    setWidth(body.clientWidth)
    return () => observer.disconnect()
  }, [])

  // A card taller than the others makes every card of this width as tall
  const widthRef = useRef(itemWidth)
  widthRef.current = itemWidth
  const [observer] = useState(() =>
    new ResizeObserver((entries) => {
      const tallest = Math.max(...entries.map((entry) => entry.borderBoxSize[0]?.blockSize ?? entry.contentRect.height))
      const at = widthRef.current
      setMeasured((current) => (current.width === at && current.height >= tallest ? current : { width: at, height: Math.max(tallest, current.width === at ? current.height : 0) }))
    }),
  )
  useLayoutEffect(() => () => observer.disconnect(), [observer])
  const observe = useCallback(
    (item: HTMLLIElement | null) => {
      if (!item) return
      observer.observe(item)
      return () => observer.unobserve(item)
    },
    [observer],
  )

  const firstShown = Math.min(total, Math.floor(scroll.top / rowHeight) * columns + 1)
  const lastShown = Math.min(total, (Math.floor((scroll.top + Math.max(0, scroll.viewport - 1)) / rowHeight) + 1) * columns)

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div ref={scroll.ref} onScroll={scroll.onScroll} className="relative min-h-0 flex-1 overflow-y-auto overflow-x-hidden">
        <div style={{ height: scroll.geometry.contentHeight || undefined }}>
          <div ref={bodyRef} className="sticky top-0 overflow-clip" style={{ height: scroll.viewport }}>
            <ul className="relative" aria-label={label}>
              {scroll.rows.flatMap(({ index: rowIndex, offset }) =>
                Array.from({ length: columns }, (_, column) => {
                  const index = rowIndex * columns + column
                  if (index >= total) return []
                  const row = getRow(index)
                  // A grid item stretches to the cell's least height, so a card's `h-full` fills it
                  const place = { top: offset, left: column * (itemWidth + cardGap), width: itemWidth, minHeight: itemHeight }
                  if (!row) {
                    return (
                      <li key={`skeleton-${index}`} aria-hidden className="absolute grid grid-cols-[minmax(0,1fr)]" style={place}>
                        <Skeleton className="h-full rounded-lg" />
                      </li>
                    )
                  }
                  return (
                    <li key={row.id} ref={observe} aria-posinset={index + 1} aria-setsize={total} className="absolute grid grid-cols-[minmax(0,1fr)]" style={place}>
                      {children(row)}
                    </li>
                  )
                }),
              )}
            </ul>
          </div>
        </div>
      </div>
      <div className="py-3 text-xs tabular-nums text-muted-foreground">
        {firstShown.toLocaleString('en-IE')}&ndash;{lastShown.toLocaleString('en-IE')} of {total.toLocaleString('en-IE')}
      </div>
    </div>
  )
}
