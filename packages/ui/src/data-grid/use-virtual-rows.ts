import { rowsInView } from './geometry'
import { useGridScroll } from './use-grid-scroll'

export type VirtualRowsOptions = {
  total: number
  rowHeight: number
  initialIndex: number
  /** Height above the rows inside the viewport, such as a sticky header. */
  inset?: number
  /**
   * The offset to draw at for the scroll offset: after a layout change, where it moves to before the scroller has
   * caught up, so no row of the wrong place is drawn or loaded in between.
   */
  settle?: (top: number) => number
}

const overscan = 6

/**
 * Rows of a fixed height over a proxy scroller, so any number of rows scrolls at native speed: `ref` and `onScroll` go
 * on the scrolling element, and each drawn row sits at `offset` from the top of the viewport's rows, below `inset`.
 * `first` and `last` are the indexes of the drawn rows, overscan included.
 */
export const useVirtualRows = ({ total, rowHeight, initialIndex, inset = 0, settle }: VirtualRowsOptions) => {
  const scroll = useGridScroll(total, rowHeight, initialIndex)
  const { ref, onScroll, viewport, geometry, scrollTo } = scroll
  const top = settle ? settle(scroll.top) : scroll.top
  const { first, last } = rowsInView(total, top, rowHeight, Math.max(0, viewport - inset), overscan)
  const rows = Array.from({ length: last - first + 1 }, (_, offset) => ({ index: first + offset, offset: (first + offset) * rowHeight - top }))
  return { ref, onScroll, viewport, top, geometry, scrollTo, rows, first, last }
}
