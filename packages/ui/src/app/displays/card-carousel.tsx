import { useQuery } from '@tanstack/react-query'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { CardPhotosModel } from '@protobase/schema'
import { useClient } from '../../data/api-provider'
import { keys } from '../../data/query-keys'
import { cn } from '../../lib/cn'
import { useAdminMeta } from '../meta-gate'
import { CardImageFrame, CardPhoto } from './card-image'
import { cardPhotoList, cardPhotosRequest, maxCardDots, scrolledPhoto, shownPhoto } from './card-photos'

type CardCarouselProps = {
  photos: CardPhotosModel
  recordKey: string
  /** The card's own image, shown first and before the photos load. */
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
 * on a touch screen or moved by arrows, with dots marking the one in view. The photos load with the card, so the dots mark
 * its own image from the start. The track sits inside the card's link, so a tap opens the record and a swipe does not;
 * the arrows sit over it, beside the link in the document, so pressing one does not open the record either. The card's list item must be `relative group/card`.
 */
export const CardCarousel = ({ photos, recordKey, cover, swipe = true, children }: CardCarouselProps) => {
  const client = useClient()
  const track = useRef<HTMLSpanElement>(null)
  // Arrow presses before the photos have loaded, applied once they have
  const early = useRef(0)
  // The photo the arrows last moved to, while the track is still on its way there
  const aim = useRef<number>(undefined)
  const [index, setIndex] = useState(0)
  // The photos' placeholders come with them, when the caller may read their field
  const target = useAdminMeta().resources[photos.resource]
  const placeholder = target?.fields[photos.image]?.file?.placeholder
  const request = cardPhotosRequest(photos, recordKey, placeholder !== undefined && target?.fields[placeholder] ? placeholder : undefined)
  const loaded = useQuery({
    queryKey: keys.list(photos.resource, request.filter, request.orderBy ?? '', request.pageSize, `card-photos:${photos.image}`),
    queryFn: async () => (await client.list(photos.resource, request)).items.map((item) => (item as Record<string, unknown>)[photos.image]),
  })
  const list = cardPhotoList(cover, loaded.data ?? [])
  const known = loaded.data !== undefined
  const single = known && list.length < 2
  const show = (position: number) => {
    const scroller = track.current
    if (scroller) scroller.scrollTo({ left: position * scroller.clientWidth })
  }
  const press = (by: number) => {
    if (!known) {
      early.current += by
      return
    }
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

  useEffect(() => {
    if (!known || early.current === 0) return
    show(shownPhoto(early.current, list.length))
    early.current = 0
  }, [known, list.length])

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
      {!single && (
        <div className="group/arrows pointer-events-none absolute inset-x-px top-px aspect-[4/3]" aria-busy={loaded.isFetching}>
          <button type="button" aria-label="Previous photo" className={cn(arrow, !swipe && touchArrow, 'left-2')} onClick={() => press(-1)}>
            <ChevronLeft className="size-4" aria-hidden />
          </button>
          <button type="button" aria-label="Next photo" className={cn(arrow, !swipe && touchArrow, 'right-2')} onClick={() => press(1)}>
            <ChevronRight className="size-4" aria-hidden />
          </button>
          {loaded.error && <span className="absolute inset-x-2 top-2 rounded bg-background/85 px-1.5 py-0.5 text-center text-xs text-danger-text">Could not load the photos</span>}
          {known && (
            <span className="absolute inset-x-0 bottom-2 flex justify-center" aria-live="polite">
              <span className="sr-only">{`Photo ${index + 1} of ${list.length}`}</span>
              <span className="flex items-center gap-1 rounded-full bg-background/70 px-1.5 py-1 text-[11px] tabular-nums leading-none" aria-hidden>
                {list.length > maxCardDots
                  ? `${index + 1} / ${list.length}`
                  : list.map((_, dot) => <span key={dot} className={cn('size-1.5 rounded-full', dot === index ? 'bg-foreground' : 'bg-foreground/35')} />)}
              </span>
            </span>
          )}
        </div>
      )}
    </>
  )
}
