import type { CSSProperties, ReactNode } from 'react'
import { snapItemWidth, snapRowGap } from './snap-row-width'

export type SnapRowProps = {
  /** How wide each item is, as a share of the row's width, such as `2 / 3` so the next one peeks in. */
  share: number
  label?: string
  /** The row's items, each an `<li>`. */
  children: ReactNode
}

/**
 * A list laid out as one row that scrolls sideways, by touch, trackpad, wheel or its scrollbar, and snaps each item to
 * its left edge. Each item is `share` of the row wide, but never narrower than 12rem or the row, so narrow shares stay
 * readable on a phone; the items are top aligned. The row scrolls on its own because the page cannot scroll sideways,
 * and only sideways: it is as tall as its tallest item. A swipe past its last item stops there.
 */
export const SnapRow = ({ share, label, children }: SnapRowProps) => (
  <ul
    aria-label={label}
    className="flex snap-x snap-mandatory items-start overflow-x-auto overflow-y-hidden overscroll-x-contain pb-1 *:w-(--snap-item-width) *:min-w-[min(100%,12rem)] *:shrink-0 *:snap-start"
    style={{ gap: snapRowGap, scrollbarWidth: 'thin', '--snap-item-width': snapItemWidth(share) } as CSSProperties}
  >
    {children}
  </ul>
)
