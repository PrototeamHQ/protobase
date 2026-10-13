/** Browsers cap element height (about 17M px in the strictest); stay well below it. */
export const maxContentHeight = 10_000_000

export type Geometry = ReturnType<typeof gridGeometry>

/** The list's height in the page, `contentHeight`: its true height, or the cap when the rows need more. */
export const gridGeometry = (total: number, rowHeight: number, viewportHeight: number) => {
  const trueHeight = total * rowHeight
  const contentHeight = Math.min(trueHeight, maxContentHeight)
  return {
    rowHeight,
    trueHeight,
    contentHeight,
    scaled: trueHeight > contentHeight,
    maxTop: Math.max(0, trueHeight - viewportHeight),
    maxScroll: Math.max(0, contentHeight - viewportHeight),
  }
}

/**
 * The offset into the rows (the virtual offset) shown at `position`, how far the top of the view is into the list.
 * They are the same unless the list is capped: then the capped range maps onto all the rows, and a position before or
 * after it moves one to one.
 */
export const topFromScroll = (geometry: Geometry, position: number) => {
  if (!geometry.scaled || position <= 0) return position
  if (position >= geometry.maxScroll) return geometry.maxTop + position - geometry.maxScroll
  return (position / geometry.maxScroll) * geometry.maxTop
}

export const scrollFromTop = (geometry: Geometry, top: number) => {
  if (!geometry.scaled || top <= 0) return top
  if (top >= geometry.maxTop) return geometry.maxScroll + top - geometry.maxTop
  return (top / geometry.maxTop) * geometry.maxScroll
}

/**
 * Where row `index` is drawn in the list when the view at `position` shows the rows from `top`: its own place, or in a
 * capped list its place relative to the view, so that it scrolls with the page until the next draw.
 */
export const rowOffset = (geometry: Geometry, index: number, top: number, position: number) => {
  const offset = index * geometry.rowHeight
  return geometry.scaled ? offset - top + position : offset
}

/** The rows drawn for a scroll offset: those in a viewport of `height`, and `overscan` more on each side. */
export const rowsInView = (total: number, top: number, rowHeight: number, height: number, overscan: number) => {
  const first = Math.min(total, Math.max(0, Math.floor(top / rowHeight) - overscan))
  const last = Math.min(total - 1, Math.floor((top + height) / rowHeight) + overscan)
  return { first, last: Math.max(first - 1, last) }
}
