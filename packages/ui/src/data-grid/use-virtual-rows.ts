import { useCallback, useLayoutEffect, useRef, useState } from 'react'
import { gridGeometry, rowOffset, rowsInView, scrollFromTop, topFromScroll } from './geometry'
import { scrollEvents, scrollParent, visibleArea } from './scroll-parent'

export type VirtualRowsOptions = {
  total: number
  rowHeight: number
  /** The row to start at, read when the list is ready to start; a fraction starts that far into the row. */
  initialIndex: number
  /** Height over the top of the rows that hides them, such as a sticky header, besides the scroller's scroll padding. */
  inset?: number
  /**
   * The offset to draw at for the scroll offset: after a layout change, where it moves to before the scroller has
   * caught up, so no row of the wrong place is drawn or loaded in between.
   */
  settle?: (top: number) => number
  /** Whether `rowHeight` is the rows' own, such as once they are measured: the list starts at `initialIndex` then. */
  ready?: boolean
  /**
   * Called with the offset into the rows at the top of the view, never below 0, whenever the view moves once the list
   * has started, so the list can come back to it with `initialIndex`.
   */
  onScroll?: (top: number) => void
}

const overscan = 6

/** How far the top of the view is into the list, and how tall the view is below the scroller's bars. */
type View = { position: number; height: number }

const viewRows = (view: View, total: number, rowHeight: number) => {
  const geometry = gridGeometry(total, rowHeight, view.height)
  const top = topFromScroll(geometry, view.position)
  return { geometry, top, topIndex: Math.floor(Math.max(0, top) / rowHeight), ...rowsInView(total, top, rowHeight, view.height, overscan) }
}

/**
 * Rows of a fixed height in a list as tall as all of them, scrolled natively by whatever scrolls it: the nearest
 * scrolling ancestor, or the page. Only the rows in view, and `overscan` more on each side, are drawn: `ref` goes on the
 * list's element, `geometry.contentHeight` tall, and each drawn row sits at `offset` from its top. Nothing listens for
 * wheel or touch: the list follows the scroll position, and draws again only when other rows come into view.
 * `first` and `last` are the indexes of the drawn rows, overscan included.
 */
export const useVirtualRows = <T extends HTMLElement>({ total, rowHeight, initialIndex, inset = 0, settle, ready = true, onScroll }: VirtualRowsOptions) => {
  const ref = useRef<T>(null)
  const scroller = useRef<HTMLElement | null>(null)
  const [view, setView] = useState<View>({ position: 0, height: 0 })
  const options = useRef({ total, rowHeight, initialIndex, inset, ready, onScroll })
  options.current = { total, rowHeight, initialIndex, inset, ready, onScroll }

  const read = useCallback((): View | undefined => {
    const content = ref.current
    if (!content || !scroller.current) return undefined
    const area = visibleArea(scroller.current)
    const hidden = options.current.inset
    return { position: area.top + hidden - content.getBoundingClientRect().top, height: Math.max(0, area.height - hidden) }
  }, [])

  // The list starts once, when its rows are ready and it has been laid out: at `initialIndex`, or at the top of its
  // scroller when that is the first row and the scroller is past it, as after a list scrolled down before. The first
  // resize observation comes after every effect of the commit that mounted the list, such as the page's sticky bars
  // saying how tall they are, and before it is painted. Until then the view is not where the list will be, so it is
  // not reported.
  const start = useRef({ pending: true, laidOut: false })

  // In a list that is not capped the drawn rows scroll with the page by themselves, so a scroll only draws again when
  // it brings other rows into view
  const shown = useRef(view)
  shown.current = view
  const measure = useCallback(() => {
    const next = read()
    if (!next) return
    const current = shown.current
    const { total, rowHeight, onScroll } = options.current
    const before = viewRows(current, total, rowHeight)
    const after = viewRows(next, total, rowHeight)
    if (!start.current.pending) onScroll?.(Math.max(0, after.top))
    const sameRows = !after.geometry.scaled && before.first === after.first && before.last === after.last && before.topIndex === after.topIndex
    if (current.height === next.height && (current.position === next.position || sameRows)) return
    shown.current = next
    setView(next)
  }, [read])

  const begin = useCallback(() => {
    if (!start.current.pending || !start.current.laidOut || !options.current.ready) return
    const view = read()
    const parent = scroller.current
    if (!view || !parent) return
    start.current.pending = false
    const { total, rowHeight, initialIndex } = options.current
    if (initialIndex > 0) parent.scrollTop += scrollFromTop(gridGeometry(total, rowHeight, view.height), initialIndex * rowHeight) - view.position
    else if (view.position > 0) parent.scrollTop = 0
  }, [read])

  useLayoutEffect(() => {
    const content = ref.current
    if (!content) return
    const parent = scrollParent(content)
    scroller.current = parent
    const events = scrollEvents(parent)
    events.addEventListener('scroll', measure, { passive: true })
    window.addEventListener('resize', measure, { passive: true })
    const observer = new ResizeObserver(() => {
      start.current.laidOut = true
      begin()
      measure()
    })
    observer.observe(parent)
    observer.observe(content)
    measure()
    return () => {
      events.removeEventListener('scroll', measure)
      window.removeEventListener('resize', measure)
      observer.disconnect()
      scroller.current = null
    }
  }, [measure, begin])

  // Anything above the list that changes height moves it in the page without a scroll
  useLayoutEffect(() => {
    begin()
    measure()
  })

  /** Scrolls to a virtual offset, for a layout change that keeps a row in view. */
  const scrollTo = useCallback(
    (top: number) => {
      const current = read()
      if (!current || !scroller.current) return
      const geometry = gridGeometry(options.current.total, options.current.rowHeight, current.height)
      scroller.current.scrollTop += scrollFromTop(geometry, top) - current.position
      measure()
    },
    [read, measure],
  )

  const drawn = viewRows(view, total, rowHeight)
  const top = settle ? settle(drawn.top) : drawn.top
  const { first, last } = settle ? rowsInView(total, top, rowHeight, view.height, overscan) : drawn
  const rows = Array.from({ length: last - first + 1 }, (_, offset) => ({ index: first + offset, offset: rowOffset(drawn.geometry, first + offset, top, view.position) }))
  return { ref, height: view.height, top, geometry: drawn.geometry, rows, first, last, scrollTo }
}
