/** The gap between cards, across and down, in pixels. */
export const cardGap = 12

/** The narrowest a card gets before a row holds one card fewer (15rem). */
export const minCardWidth = 240

/** How many cards fit across `width`, as a grid of `repeat(auto-fill, minmax(15rem, 1fr))` would place them. */
export const cardColumns = (width: number) => Math.max(1, Math.floor((width + cardGap) / (minCardWidth + cardGap)))

export const cardWidth = (width: number, columns: number) => Math.max(0, (width - (columns - 1) * cardGap) / columns)

/** The records the card rows `first` to `last` hold, as a first and last record index. */
export const recordRange = (first: number, last: number, columns: number, total: number) => ({
  start: first * columns,
  end: Math.max(0, Math.min(total, (last + 1) * columns) - 1),
})

export type CardLayout = { columns: number; rowHeight: number }

/**
 * The scroll offset after a layout change that keeps the same records in view: the same place in the same row when
 * only the row height changed, else the row now holding the first record of the row that was at the top.
 */
export const anchoredTop = (top: number, before: CardLayout, after: CardLayout) => {
  const row = top / before.rowHeight
  if (before.columns === after.columns) return row * after.rowHeight
  return Math.floor((Math.floor(row) * before.columns) / after.columns) * after.rowHeight
}
