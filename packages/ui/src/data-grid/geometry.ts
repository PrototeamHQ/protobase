/** Browsers cap element height (about 17M px in the strictest); stay well below it. */
export const maxContentHeight = 10_000_000

export type Geometry = ReturnType<typeof gridGeometry>

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

/** Maps the native scroll position onto the virtual (true) pixel offset. */
export const topFromScroll = (geometry: Geometry, scrollTop: number) =>
  geometry.maxScroll === 0 ? 0 : (scrollTop / geometry.maxScroll) * geometry.maxTop

export const scrollFromTop = (geometry: Geometry, top: number) =>
  geometry.maxTop === 0 ? 0 : (top / geometry.maxTop) * geometry.maxScroll

export const clampTop = (geometry: Geometry, top: number) => Math.min(Math.max(0, top), geometry.maxTop)

/** The rows drawn for a scroll offset: those in a viewport of `height`, and `overscan` more on each side. */
export const rowsInView = (total: number, top: number, rowHeight: number, height: number, overscan: number) => {
  const first = Math.max(0, Math.floor(top / rowHeight) - overscan)
  const last = Math.min(total - 1, Math.floor((top + height) / rowHeight) + overscan)
  return { first, last: Math.max(first - 1, last) }
}
