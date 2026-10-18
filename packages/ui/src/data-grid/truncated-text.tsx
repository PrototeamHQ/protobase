import type { MouseEvent } from 'react'
import { cn } from '../lib/cn'

// Layout is read only on hover, and the whole text is offered only when it is cut. `clientWidth` rounds down, so a text
// that fits within a fraction of a pixel would read as cut; the box's own width does not.
const offerWhole = (text: string) => (event: MouseEvent<HTMLSpanElement>) => {
  const span = event.currentTarget
  if (span.scrollWidth > Math.ceil(span.getBoundingClientRect().width)) span.title = text
  else span.removeAttribute('title')
}

/** Text cut to one line with an ellipsis, that shows whole as a tooltip when hovered while cut. */
export const TruncatedText = ({ text, className }: { text: string; className?: string }) => (
  <span className={cn('truncate', className)} onMouseEnter={offerWhole(text)}>
    {text}
  </span>
)
