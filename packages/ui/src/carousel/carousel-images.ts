import type { StoredFile } from '@protobase/client'
import { shownImage } from '../live/file-values'

/** An image a carousel shows: a link with what it shows, or a file field's value, as records carry it. */
export type CarouselImage = { src: string; alt: string } | (StoredFile & { alt?: string })

// A frame up to about half a page wide: of a file's variants, the smallest that covers it is drawn, the file itself when none does
const box = { width: 640, height: 480 }

/** What each slide draws, in order: a file that is missing or is no raster image is left out. */
export const carouselSlides = (images: readonly CarouselImage[]) =>
  images.flatMap((image) => {
    if ('src' in image) return [{ image: { url: image.src }, alt: image.alt }]
    const shown = shownImage(image, box)
    return shown ? [{ image: shown, alt: image.alt ?? '' }] : []
  })
