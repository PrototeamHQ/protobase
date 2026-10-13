import { cardPhotoLimit } from '@protobase/schema/internal'
import { isStoredFile } from '../../live/file-values'

/** The most photos a card steps through, its own image among them, each marked by a dot. */
export const maxCardDots = cardPhotoLimit

/**
 * The files a card steps through: its own image first, then its photos less that same file, at most `maxCardDots`;
 * empty values are left out.
 */
export const cardPhotoList = (cover: unknown, photos: readonly unknown[]): unknown[] => {
  const coverUri = isStoredFile(cover) ? cover.uri : undefined
  const rest = photos.filter((photo) => isStoredFile(photo) && photo.uri !== coverUri)
  return (coverUri === undefined ? rest : [cover, ...rest]).slice(0, maxCardDots)
}

/** The position shown after `step` presses forward, or back when negative, wrapping around both ends. */
export const shownPhoto = (step: number, count: number) => (count === 0 ? 0 : ((step % count) + count) % count)

/** The position a track of `count` photos, each `width` wide, shows when scrolled to `left`: the one mostly in view. */
export const scrolledPhoto = (left: number, width: number, count: number) => (width <= 0 || count === 0 ? 0 : Math.min(count - 1, Math.max(0, Math.round(left / width))))
