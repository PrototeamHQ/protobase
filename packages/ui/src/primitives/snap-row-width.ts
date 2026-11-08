/** The space between the items of a `SnapRow`, Tailwind's `gap-3`. */
export const snapRowGap = '0.75rem'

/** How wide an item of a `SnapRow` is when no share sizes it, in pixels. */
export const snapCardWidth = 256

/**
 * How wide an item of a row is at `share` of the row's width, the gaps taken off so that `1 / share` items fill it
 * exactly: a third leaves room for three items and the two gaps between them.
 */
export const snapItemWidth = (share: number) => {
  if (!(share > 0 && share <= 1)) throw new Error(`An item's share of a row is above 0 and at most 1, not ${share}`)
  return `calc((100% + ${snapRowGap}) * ${share} - ${snapRowGap})`
}

/**
 * The width and least width of an item of a `SnapRow`: at `share` of the row, but never narrower than 12rem or the
 * row, so narrow shares stay readable on a phone; without one `snapCardWidth`, but never wider than the row, so a very
 * narrow phone does not cut a card off.
 */
export const snapItemSize = (share: number | undefined) =>
  share === undefined ? { width: `min(${snapCardWidth}px, 100%)`, minWidth: '0px' } : { width: snapItemWidth(share), minWidth: 'min(100%, 12rem)' }
