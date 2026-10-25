import type { HTMLAttributes, ReactNode } from 'react'
import { cn } from '../lib/cn'
import type { CarouselState } from './use-carousel'

type CarouselTrackProps = HTMLAttributes<HTMLSpanElement> & {
  carousel: CarouselState
  /** Whether a swipe steps through the slides; off, it scrolls what the track sits in, such as a row that scrolls sideways. */
  swipe: boolean
  /** One per slide, each filling the track. */
  slides: ReactNode[]
}

/** The slides side by side in a row that snaps slide by slide and hides its scrollbar. */
export const CarouselTrack = ({ carousel, swipe, slides, className, ...rest }: CarouselTrackProps) => (
  <span
    {...rest}
    ref={carousel.track}
    tabIndex={-1}
    onPointerDown={carousel.touch}
    onScroll={(event) => carousel.scrolled(event.currentTarget)}
    className={cn(
      'flex size-full snap-x snap-mandatory outline-none [scrollbar-width:none] motion-safe:scroll-smooth [&::-webkit-scrollbar]:hidden',
      // A swipe past the last slide stops there, without going back a page; off, it scrolls what the track sits in
      swipe ? 'overflow-x-auto overscroll-x-contain' : 'overflow-x-hidden',
      className,
    )}
  >
    {slides.map((slide, position) => (
      <span key={position} className="block size-full shrink-0 snap-start snap-always">
        {slide}
      </span>
    ))}
  </span>
)
