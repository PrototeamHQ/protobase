import { useCallback, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import type { GridRow, RowSource } from '../../data-grid'
import { usePagedRows } from '../../data-grid/use-paged-rows'
import { useVirtualRows } from '../../data-grid/use-virtual-rows'
import { createFlipGuard } from '../../lib/flip-guard'
import { Skeleton } from '../../primitives/skeleton'
import { anchoredTop, cardColumns, cardGap, cardPlace, cardWidth, placeRow, recordRange, type CardLayout } from './card-layout'
import { withMeasuredHeight, type MeasuredHeights } from './measured-heights'

type VirtualCardsProps = {
  source: RowSource
  label: string
  /** The record to start at, the first of its row; a fraction starts that far into the row. */
  initialIndex: number
  /** Called with the first record of the row at the top of the view, and how far into the row, as the view moves. */
  onScrollIndex: (index: number) => void
  /** The least height of a card of this width, used until the drawn cards are measured. */
  minHeight: (width: number) => number
  children: (row: GridRow) => ReactNode
}

/**
 * Cards in rows as wide as the list, scrolled like the table by the page or the nearest scrolling ancestor: the list is
 * as tall as all its rows, only the rows in view are drawn, and the records are loaded in the table's pages, so a
 * change of width keeps the loaded pages and the first record in view. Every card in a width is as tall as the tallest
 * drawn so far at that width.
 */
export const VirtualCards = ({ source, label, initialIndex, onScrollIndex, minHeight, children }: VirtualCardsProps) => {
  const { total } = source
  // The record to start at is the one at mount; later ones are where the list has been since
  const [startIndex] = useState(initialIndex)
  const [width, setWidth] = useState(0)
  const columns = cardColumns(width)
  const itemWidth = cardWidth(width, columns)
  const [measured, setMeasured] = useState<MeasuredHeights>(() => new Map())
  const itemHeight = Math.ceil(Math.max(minHeight(itemWidth), measured.get(itemWidth) ?? 0))
  const rowHeight = itemHeight + cardGap

  // Keep the same records in view across a change of columns or card height, once the list has reached the top of the
  // view
  const layout: CardLayout = { columns, rowHeight }
  const anchor = useRef({ layout, top: 0 })
  const changed = anchor.current.top > 0 && (anchor.current.layout.columns !== columns || anchor.current.layout.rowHeight !== rowHeight)
  const settle = (top: number) => (changed ? anchoredTop(anchor.current.top, anchor.current.layout, layout) : top)
  // Until a card of this width is measured, its height is a guess, and the list waits for it to start at `initialIndex`
  const ready = itemWidth > 0 && measured.has(itemWidth)
  const onScroll = (top: number) => onScrollIndex(cardPlace(top, layout))
  const scroll = useVirtualRows<HTMLUListElement>({ total: Math.ceil(total / columns), rowHeight, initialIndex: placeRow(startIndex, columns), settle, ready, onScroll })
  useLayoutEffect(() => {
    if (changed) scroll.scrollTo(scroll.top)
    anchor.current = { layout, top: scroll.top }
  })
  const range = recordRange(scroll.first, scroll.last, columns, total)
  const getRow = usePagedRows({ total, rowAt: source.rowAt, loadRows: source.loadRows, revision: source.revision, latencyMs: 0 }, range.start, range.end)

  // The cards' width changes their height, which can bring or take away a scrollbar that changes their width: should
  // that ever loop, the guard holds a width that fits instead of the cards flashing between two
  const [guard] = useState(() => createFlipGuard())
  useLayoutEffect(() => {
    const body = scroll.ref.current
    if (!body) return
    const update = () => setWidth(guard(body.clientWidth, performance.now()))
    const observer = new ResizeObserver(update)
    observer.observe(body)
    update()
    return () => observer.disconnect()
  }, [guard])

  // A card taller than the others makes every card of this width as tall
  const widthRef = useRef(itemWidth)
  widthRef.current = itemWidth
  const [observer] = useState(() =>
    new ResizeObserver((entries) => {
      const tallest = Math.max(...entries.map((entry) => entry.borderBoxSize[0]?.blockSize ?? entry.contentRect.height))
      const at = widthRef.current
      setMeasured((current) => withMeasuredHeight(current, at, tallest))
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

  return (
    <ul ref={scroll.ref} className="relative min-w-0 flex-auto" aria-label={label} style={{ height: scroll.geometry.contentHeight }}>
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
  )
}
