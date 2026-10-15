/** How many card widths the list remembers a measured height for. */
const remembered = 8

/** The tallest card measured at each of the last few card widths, the latest width last. */
export type MeasuredHeights = ReadonlyMap<number, number>

/**
 * `heights` with a card `height` tall measured at `width`, kept at the taller of it and the height measured there
 * before, and `heights` itself when that changes nothing. A width the list comes back to, as with and without a
 * scrollbar, keeps its height instead of falling back to a guess: a guess shorter than the cards shrinks the list, which
 * can take the scrollbar away, widen the cards back, and measure them taller again, every frame.
 */
export const withMeasuredHeight = (heights: MeasuredHeights, width: number, height: number): MeasuredHeights => {
  const current = heights.get(width)
  if (current !== undefined && current >= height) return heights
  const next = new Map(heights)
  next.delete(width)
  next.set(width, height)
  for (const oldest of next.keys()) {
    if (next.size <= remembered) break
    next.delete(oldest)
  }
  return next
}
