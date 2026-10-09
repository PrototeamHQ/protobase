/** Browsers cap element height (about 17M px in the strictest); stay well below it. */
export const maxContentHeight = 10_000_000

const chunk = 2000
const windowSize = 5000

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

/** The slice of rows handed to the virtualizer; it moves in whole chunks so row measurements stay small. */
export const windowFor = (total: number, top: number, rowHeight: number) => {
  const topRow = Math.floor(top / rowHeight)
  const base = Math.min(Math.max(0, Math.floor(topRow / chunk) * chunk - chunk), Math.max(0, total - windowSize))
  return { base, count: Math.min(windowSize, total - base) }
}
