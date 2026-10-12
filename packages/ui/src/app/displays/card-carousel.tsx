import { useQuery } from '@tanstack/react-query'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import type { CardPhotosModel } from '@protobase/schema'
import { useClient } from '../../data/api-provider'
import { keys } from '../../data/query-keys'
import { cn } from '../../lib/cn'
import { cardPhotoList, cardPhotosRequest, maxCardDots, shownPhoto } from './card-photos'

type CardCarouselProps = {
  photos: CardPhotosModel
  recordKey: string
  /** The card's own image, shown first and before the photos load. */
  cover: unknown
  /** The card, drawn with the file it shows. */
  children: (photo: unknown) => ReactNode
}

// Shown on hover or focus with a mouse, always on a touch screen.
const arrow =
  'pointer-events-auto absolute top-1/2 flex size-7 -translate-y-1/2 items-center justify-center rounded-full bg-background/85 text-foreground shadow-sm opacity-0 transition-opacity group-hover/card:opacity-100 group-focus-within/card:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 [@media(hover:none)]:opacity-100'

/**
 * A card whose picture steps through its photos with arrows, the card's own image first. The photos load when an arrow
 * is first pressed, so the list loads as it does without them. The arrows sit over the card's link, beside it in the
 * document, so pressing one does not open the record; the card's list item must be `relative group/card`.
 */
export const CardCarousel = ({ photos, recordKey, cover, children }: CardCarouselProps) => {
  const client = useClient()
  const [opened, setOpened] = useState(false)
  const [step, setStep] = useState(0)
  const request = cardPhotosRequest(photos, recordKey)
  const loaded = useQuery({
    queryKey: keys.list(photos.resource, request.filter, request.orderBy ?? '', request.pageSize, `card-photos:${photos.image}`),
    enabled: opened,
    queryFn: async () => (await client.list(photos.resource, request)).items.map((item) => (item as Record<string, unknown>)[photos.image]),
  })
  const list = cardPhotoList(cover, loaded.data ?? [])
  const index = shownPhoto(step, list.length)
  const press = (by: number) => {
    setOpened(true)
    setStep((current) => current + by)
  }
  const single = loaded.data !== undefined && list.length < 2

  return (
    <>
      {children(list[index])}
      {!single && (
        <div className="pointer-events-none absolute inset-x-px top-px aspect-[4/3]" aria-busy={loaded.isFetching}>
          <button type="button" aria-label="Previous photo" className={cn(arrow, 'left-2')} onClick={() => press(-1)}>
            <ChevronLeft className="size-4" aria-hidden />
          </button>
          <button type="button" aria-label="Next photo" className={cn(arrow, 'right-2')} onClick={() => press(1)}>
            <ChevronRight className="size-4" aria-hidden />
          </button>
          {loaded.error && <span className="absolute inset-x-2 top-2 rounded bg-background/85 px-1.5 py-0.5 text-center text-xs text-danger-text">Could not load the photos</span>}
          {loaded.data !== undefined && (
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
