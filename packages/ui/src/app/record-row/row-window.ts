import { snapCardWidth } from '../../primitives/snap-row-width'

/** The gap after a card of a record row, in pixels. */
const rowCardGap = 12

/** How many cards beyond each edge of the view are drawn, so a short scroll shows cards already there. */
const overscan = 3

/**
 * The cards of a row of `total` to draw when it is scrolled `scrollLeft` into a view `width` wide: from `start` up to
 * `end` (not included), the ones in view and `overscan` more on each side, none past either end. A card is 256px wide,
 * or the view's width when that is narrower, as a `SnapRow` sizes it.
 */
export const rowWindow = (scrollLeft: number, width: number, total: number) => {
  const step = Math.max(1, Math.min(snapCardWidth, width)) + rowCardGap
  const first = Math.floor(Math.max(0, scrollLeft) / step)
  const last = Math.ceil((Math.max(0, scrollLeft) + width) / step)
  return { start: Math.max(0, first - overscan), end: Math.min(total, last + overscan) }
}
