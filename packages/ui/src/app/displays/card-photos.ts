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
