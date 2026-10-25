import type { ReactNode } from 'react'
import { CarouselControls } from '../../carousel/carousel-controls'
import { CarouselTrack } from '../../carousel/carousel-track'
import { useCarousel } from '../../carousel/use-carousel'
import { CardImageFrame, CardPhoto } from './card-image'
import { cardPhotoList } from './card-photos'

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

/**
 * A card whose picture steps through its photos, the card's own image first: a track that snaps photo by photo, swiped
 * on a touch screen or moved by arrows, with dots marking the one in view. The photos come with the card's row, in the
 * same answer as the list, so the dots mark its own image from the start. The track sits inside the card's link, so a
 * tap opens the record and a swipe does not; the arrows sit over it, beside the link in the document, so pressing one
 * does not open the record either. The card's list item must be `relative group/card`.
 */
export const CardCarousel = ({ photos, cover, swipe = true, children }: CardCarouselProps) => {
  const list = cardPhotoList(cover, photos)
  const carousel = useCarousel(list.length)

  const picture = (
    <CardImageFrame>
      <CarouselTrack data-card-photos carousel={carousel} swipe={swipe} slides={list.map((photo) => <CardPhoto value={photo} />)} />
    </CardImageFrame>
  )

  return (
    <>
      {children(picture)}
      <CarouselControls
        carousel={carousel}
        count={list.length}
        swipe={swipe}
        reveal="group-has-[[data-card-photos]:hover]/card:opacity-100"
        className="inset-x-px top-px aspect-[4/3]"
      />
    </>
  )
}
