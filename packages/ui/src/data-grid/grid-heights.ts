// In rem, as the header's `h-8`, the footer's `h-9` and the cells' text and buttons are
const header = 2
const row = 2.25
const compactRow = 1.75
// A small button's height and the gap above it, for a column with something `below` its cells
const below = 2
const footer = 2.25

/** The grid's heights in pixels, which rows are placed and virtualized by, for a root text size of `rem` pixels. */
export const gridHeights = (rem: number, { compact, withBelow }: { compact: boolean; withBelow: boolean }) => ({
  header: header * rem,
  row: ((compact ? compactRow : row) + (withBelow ? below : 0)) * rem,
  footer: footer * rem,
})
