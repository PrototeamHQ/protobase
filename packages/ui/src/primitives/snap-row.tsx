import type { CSSProperties, ReactNode } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { snapItemSize, snapRowGap } from './snap-row-width'
import type { SnapScroll } from './use-snap-scroll'
import { text } from './messages'

export type SnapRowProps = {
  /** The row's scroll, from `useSnapScroll`. */
  scroll: SnapScroll
  /** What the items are, such as "Homes": the list's label, and the arrows' as "Next homes". */
  label: string
  /** How wide each item is, as a share of the row's width, such as `2 / 3` so the next one peeks in; 256px when omitted. */
  share?: number
  /** The row's items, each an `<li>`. */
  children: ReactNode
}

const arrowClass = 'absolute top-1/2 z-10 hidden size-8 -translate-y-1/2 items-center justify-center rounded-full border border-border-strong bg-background shadow-pop hover:bg-muted sm:flex'

/**
 * A list laid out as one row that scrolls sideways, by touch, trackpad, wheel or its scrollbar, and with a pointer by its
 * arrow buttons, snapping each item to its left edge. Each item is `share` of the row wide, but never narrower than 12rem
 * or the row, else 256px but never wider than the row (`snapItemSize`). The row scrolls on its own because the page
 * cannot scroll sideways, and only sideways: it is as tall as its tallest item. A swipe past its last item stops there.
 */
export const SnapRow = ({ scroll, label, share, children }: SnapRowProps) => {
  const size = snapItemSize(share)
  return (
    <div className="relative min-w-0">
      <ul
        ref={scroll.ref}
        aria-label={label}
        className="relative flex snap-x snap-mandatory overflow-x-auto overflow-y-hidden overscroll-x-contain pb-1 *:w-(--snap-item-width) *:min-w-(--snap-item-min-width) *:shrink-0 *:snap-start"
        style={{ gap: snapRowGap, scrollbarWidth: 'thin', '--snap-item-width': size.width, '--snap-item-min-width': size.minWidth } as CSSProperties}
      >
        {children}
      </ul>
      {scroll.back && (
        <button type="button" aria-label={text('previous', { label: label.toLowerCase() })} onClick={() => scroll.page(-1)} className={`${arrowClass} -left-3`}>
          <ChevronLeft className="size-4" aria-hidden />
        </button>
      )}
      {scroll.on && (
        <button type="button" aria-label={text('next', { label: label.toLowerCase() })} onClick={() => scroll.page(1)} className={`${arrowClass} -right-3`}>
          <ChevronRight className="size-4" aria-hidden />
        </button>
      )}
    </div>
  )
}
