import type { ReactNode } from 'react'
import { FileImage } from '../../live/file-image'
import { shownImage } from '../../live/file-values'

/** A raster image filling its frame; nothing for any other value. */
export const CardPhoto = ({ value }: { value: unknown }) => {
  const image = shownImage(value, { width: 320, height: 240 })
  return image ? <FileImage image={image} loading="lazy" className="size-full object-cover" /> : null
}

/** The frame across a card's top, from the edge of the card in, holding its picture. */
export const CardImageFrame = ({ children }: { children: ReactNode }) => (
  <span className="-mx-3 -mt-3 mb-1.5 block aspect-[4/3] overflow-hidden rounded-t-lg border-b border-border bg-muted">{children}</span>
)

/** A picture across the card's top: a raster image only, an empty frame otherwise. */
export const CardImage = ({ value }: { value: unknown }) => (
  <CardImageFrame>
    <CardPhoto value={value} />
  </CardImageFrame>
)
