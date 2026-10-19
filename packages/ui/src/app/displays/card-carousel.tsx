import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useRef, useState, type ReactNode } from 'react'
import { cn } from '../../lib/cn'
import { CardImageFrame, CardPhoto } from './card-image'
import { cardPhotoList, scrolledPhoto, shownPhoto } from './card-photos'
import { text } from './messages'

type CardCarouselProps = {
  /** The record's photos, as its list loaded them. */
  photos: readonly unknown[]
  /** The card's own image, shown first. */
  cover: unknown
  /** Whether a swipe steps through the photos; off, it scrolls what the card sits in, such as a row that scrolls sideways. */
  swipe?: boolean
  /** The card, drawn with the picture across its top. */
  children: (picture: ReactNode) => ReactNode
}

// Shown while the pointer is over the picture or the arrows, or an arrow has keyboard focus; always on a touch screen
// when swiping is off, as nothing else steps through the photos there.
const arrow =
  'pointer-events-auto absolute top-1/2 flex size-7 -translate-y-1/2 items-center justify-center rounded-full bg-background/85 text-foreground shadow-sm opacity-0 transition-opacity group-has-[[data-card-photos]:hover]/card:opacity-100 group-hover/arrows:opacity-100 group-has-[:focus-visible]/arrows:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30'
const touchArrow = '[@media(hover:none)]:opacity-100'

/**
 * A card whose picture steps through its photos, the card's own image first: a track that snaps photo by photo, swiped
 * on a touch screen or moved by arrows, with dots marking the one in view. The photos come with the card's row, in the
 * same answer as the list, so the dots mark its own image from the start. The track sits inside the card's link, so a
 * tap opens the record and a swipe does not; the arrows sit over it, beside the link in the document, so pressing one
 * does not open the record either. The card's list item must be `relative group/card`.
 */
export const CardCarousel = ({ photos, cover, swipe = true, children }: CardCarouselProps) => {
  const track = useRef<HTMLSpanElement>(null)
  // The photo the arrows last moved to, while the track is still on its way there
  const aim = useRef<number>(undefined)
  const [index, setIndex] = useState(0)
  const list = cardPhotoList(cover, photos)
  const show = (position: number) => {
    const scroller = track.current
    if (scroller) scroller.scrollTo({ left: position * scroller.clientWidth })
  }
  const press = (by: number) => {
    aim.current = shownPhoto((aim.current ?? index) + by, list.length)
    show(aim.current)
  }
  const touch = () => {
    aim.current = undefined
  }
  const scrolled = (scroller: HTMLElement) => {
    setIndex(scrolledPhoto(scroller.scrollLeft, scroller.clientWidth, list.length))
    if (aim.current !== undefined && Math.abs(scroller.scrollLeft - aim.current * scroller.clientWidth) < 1) aim.current = undefined
  }

  const picture = (
    <CardImageFrame>
      <span
        ref={track}
        tabIndex={-1}
        data-card-photos
        onPointerDown={touch}
        onScroll={(event) => scrolled(event.currentTarget)}
        className={cn(
          'flex size-full snap-x snap-mandatory outline-none [scrollbar-width:none] motion-safe:scroll-smooth [&::-webkit-scrollbar]:hidden',
          // A swipe past the last photo stops there, without going back a page; off, it scrolls what the card sits in
          swipe ? 'overflow-x-auto overscroll-x-contain' : 'overflow-x-hidden',
        )}
      >
        {list.map((photo, position) => (
          <span key={position} className="block size-full shrink-0 snap-start snap-always">
            <CardPhoto value={photo} />
          </span>
        ))}
      </span>
    </CardImageFrame>
  )

  return (
    <>
      {children(picture)}
      {list.length > 1 && (
        <div className="group/arrows pointer-events-none absolute inset-x-px top-px aspect-[4/3]">
          <button type="button" aria-label={text('previousPhoto')} className={cn(arrow, !swipe && touchArrow, 'left-2')} onClick={() => press(-1)}>
            <ChevronLeft className="size-4" aria-hidden />
          </button>
          <button type="button" aria-label={text('nextPhoto')} className={cn(arrow, !swipe && touchArrow, 'right-2')} onClick={() => press(1)}>
            <ChevronRight className="size-4" aria-hidden />
          </button>
          <span className="absolute inset-x-0 bottom-2 flex justify-center" aria-live="polite">
            <span className="sr-only">{text('photoOf', index + 1, list.length)}</span>
            <span className="flex items-center gap-1 rounded-full bg-background/70 px-1.5 py-1 leading-none" aria-hidden>
              {list.map((_, dot) => (
                <span key={dot} className={cn('size-1.5 rounded-full', dot === index ? 'bg-foreground' : 'bg-foreground/35')} />
              ))}
            </span>
          </span>
        </div>
      )}
    </>
  )
}
