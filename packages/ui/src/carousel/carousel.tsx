import { cn } from '../lib/cn'
import { FileImage } from '../live/file-image'
import { CarouselControls } from './carousel-controls'
import { carouselSlides, type CarouselImage } from './carousel-images'
import { CarouselTrack } from './carousel-track'
import { useCarousel } from './use-carousel'

export type CarouselProps = {
  /** The images in order: links with what each shows, or file field values. */
  images: readonly CarouselImage[]
  /** What the images are, read out with the carousel. */
  label?: string
  /** `cover` fills the frame and crops what overflows it, the default; `contain` shows each image whole. */
  fit?: 'cover' | 'contain'
  /** Whether a swipe steps through the images; off, it scrolls what the carousel sits in, such as a row that scrolls sideways. */
  swipe?: boolean
  /** The frame's classes, such as its aspect ratio, border and rounding. */
  className?: string
}

/**
 * Images side by side in a frame that snaps image by image, swiped on a touch screen or moved by arrows on hover, with
 * dots marking the one in view; the record cards' photos step the same way. A single image shows without arrows or dots.
 */
export const Carousel = ({ images, label, fit = 'cover', swipe = true, className }: CarouselProps) => {
  const slides = carouselSlides(images)
  const carousel = useCarousel(slides.length)
  return (
    <div role="group" aria-roledescription="carousel" aria-label={label} className={cn('group/carousel relative overflow-hidden', className)}>
      <CarouselTrack
        data-carousel-track
        carousel={carousel}
        swipe={swipe}
        slides={slides.map(({ image, alt }) => (
          <FileImage image={image} alt={alt} loading="lazy" className={cn('size-full', fit === 'cover' ? 'object-cover' : 'object-contain')} />
        ))}
      />
      <CarouselControls carousel={carousel} count={slides.length} swipe={swipe} reveal="group-hover/carousel:opacity-100" className="inset-0" />
    </div>
  )
}
