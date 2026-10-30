import { ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '../lib/cn'
import { text } from './messages'
import type { CarouselState } from './use-carousel'

type CarouselControlsProps = {
  carousel: CarouselState
  count: number
  /** Whether a swipe steps through the slides; off, the arrows always show on a touch screen. */
  swipe: boolean
  /** The classes that show the arrows while the pointer is over the track, from a group around both. */
  reveal: string
  /** Where the controls lie over the track, from the nearest positioned element. */
  className: string
}

// Shown while the pointer is over the track or the arrows, or an arrow has keyboard focus; always on a touch screen
// when swiping is off, as nothing else steps through the slides there.
const arrow =
  'pointer-events-auto absolute top-1/2 flex size-7 -translate-y-1/2 items-center justify-center rounded-full bg-background/85 text-foreground shadow-sm opacity-0 transition-opacity group-hover/arrows:opacity-100 group-has-[:focus-visible]/arrows:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30'
const touchArrow = '[@media(hover:none)]:opacity-100'

/**
 * The arrows and dots over a track of more than one slide. They sit beside the track in the document, so pressing an
 * arrow inside a link, as a record card's picture is, does not follow it.
 */
export const CarouselControls = ({ carousel, count, swipe, reveal, className }: CarouselControlsProps) => {
  if (count < 2) return null
  const { index, press } = carousel
  return (
    <div className={cn('group/arrows pointer-events-none absolute', className)}>
      <button type="button" aria-label={text('previousPhoto')} className={cn(arrow, reveal, !swipe && touchArrow, 'left-2')} onClick={() => press(-1)}>
        <ChevronLeft className="size-4" aria-hidden />
      </button>
      <button type="button" aria-label={text('nextPhoto')} className={cn(arrow, reveal, !swipe && touchArrow, 'right-2')} onClick={() => press(1)}>
        <ChevronRight className="size-4" aria-hidden />
      </button>
      <span className="absolute inset-x-0 bottom-2 flex justify-center" aria-live="polite">
        <span className="sr-only">{text('photoOf', { index: index + 1, count })}</span>
        <span className="flex items-center gap-1 rounded-full bg-background/70 px-1.5 py-1 leading-none" aria-hidden>
          {Array.from({ length: count }, (_, dot) => (
            <span key={dot} className={cn('size-1.5 rounded-full', dot === index ? 'bg-foreground' : 'bg-foreground/35')} />
          ))}
        </span>
      </span>
    </div>
  )
}
