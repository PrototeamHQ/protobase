/** How wide a card of a record row is, and the gap after it, in pixels: the step from one card to the next. */
export const rowCardWidth = 256
export const rowCardGap = 12
const step = rowCardWidth + rowCardGap

/** How many cards beyond each edge of the view are drawn, so a short scroll shows cards already there. */
const overscan = 3

/**
 * The cards of a row of `total` to draw when it is scrolled `scrollLeft` into a view `width` wide: from `start` up to
 * `end` (not included), the ones in view and `overscan` more on each side, none past either end.
 */
export const rowWindow = (scrollLeft: number, width: number, total: number) => {
  const first = Math.floor(Math.max(0, scrollLeft) / step)
  const last = Math.ceil((Math.max(0, scrollLeft) + width) / step)
  return { start: Math.max(0, first - overscan), end: Math.min(total, last + overscan) }
}

/** The width of the cards before `index`, with their gaps: what stands in for the cards not drawn. */
export const rowOffset = (index: number) => index * step
