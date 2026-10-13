import type { ImageVariant } from '@protobase/schema'

/**
 * The sizes a listing photo is stored in besides the upload: a card's picture across a list card (two device pixels
 * per pixel of a card up to 400 wide), and a square thumbnail for tables.
 */
export const photoVariants: Record<string, ImageVariant> = {
  card: { width: 800, height: 600, fit: 'cover', format: 'webp', quality: 75 },
  thumb: { width: 96, height: 96, fit: 'cover', format: 'webp', quality: 70 },
}
