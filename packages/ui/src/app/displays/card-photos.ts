import { createWhere, printFilter, type CardPhotosModel } from '@protobase/schema'
import { isStoredFile } from '../../live/file-values'

const where = createWhere()

/** The most photos a card loads, in one request. */
export const maxCardPhotos = 100

/** The most photos a card marks with dots; past it, a count such as `3 / 24`. */
export const maxCardDots = 10

/**
 * The list request for a card's photos: the records pointing at the card's, in the display's order, with only their
 * image and its placeholder field, when it has one.
 */
export const cardPhotosRequest = (photos: CardPhotosModel, recordKey: string, placeholder?: string) => ({
  filter: printFilter(where.eq(photos.field, recordKey)),
  ...(photos.sort !== undefined && { orderBy: photos.sort }),
  fields: placeholder === undefined ? [photos.image] : [photos.image, placeholder],
  pageSize: maxCardPhotos,
})

/** The files a card steps through: its own image first, then the loaded photos less that same file; empty values are left out. */
export const cardPhotoList = (cover: unknown, loaded: readonly unknown[]): unknown[] => {
  const coverUri = isStoredFile(cover) ? cover.uri : undefined
  const rest = loaded.filter((photo) => isStoredFile(photo) && photo.uri !== coverUri)
  return coverUri === undefined ? rest : [cover, ...rest]
}

/** The position shown after `step` presses forward, or back when negative, wrapping around both ends. */
export const shownPhoto = (step: number, count: number) => (count === 0 ? 0 : ((step % count) + count) % count)
