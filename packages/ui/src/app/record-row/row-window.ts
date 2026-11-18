import { snapCardWidth, snapRowGap } from '../../primitives/snap-row-width'

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

/** How many cards beyond the drawn ones keep a place of their own, which a swipe snaps to before it is drawn. */
const placesAround = 50

/**
 * The cards of a row of `total` that have a place of their own while `start` up to `end` are drawn: those and
 * `placesAround` more on each side. The rest stand together in one spacer at each end (`rowSpan`), so a row of a hundred
 * thousand records draws a few hundred elements, not one for each.
 */
export const rowPlaces = (start: number, end: number, total: number) => ({ from: Math.max(0, start - placesAround), to: Math.min(total, end + placesAround) })

/** The width of `count` cards of a row and the gaps between them, as a `SnapRow` sizes its cards, for a spacer that stands in for them. */
export const rowSpan = (count: number) => `calc(${count} * (min(${snapCardWidth}px, 100%) + ${snapRowGap}) - ${snapRowGap})`
