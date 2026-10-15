import type { KeyValue, ResourceModel } from '@protobase/schema'
import { encodeKey } from '@protobase/schema/internal'
import { isStoredFile, shownImage } from '../../live/file-values'

/** A photo of a gallery: its file, and the record holding it by its key in the record API's text form, when one does. */
export type GalleryItem = { file: unknown; key?: string }

/** The most photo records a gallery reads: the list API's largest page. */
export const galleryPhotoLimit = 500

// A file the gallery can draw: an image with a link, not a missing file or a document.
const isPicture = (value: unknown) => shownImage(value, { width: 0, height: 0 }) !== undefined

// A row's key in the record API's text form, or none when the caller cannot read every part of it.
const keyOf = (holder: ResourceModel, row: Record<string, unknown>) => {
  const parts = holder.primaryKey.map((name) => row[name])
  if (parts.some((part) => part === null || part === undefined)) return undefined
  return encodeKey(parts as KeyValue[])
}

/**
 * The photos a gallery steps through: the record's own `cover` first, then the `image` of each of the photo records
 * `rows`, less the one the cover already shows, whose record the cover takes; empty values, missing files and files
 * that are no image are left out.
 */
export const galleryItems = (cover: unknown, rows: ReadonlyArray<Record<string, unknown>>, image: string | undefined, holder: ResourceModel | undefined): GalleryItem[] => {
  const photos = image === undefined ? [] : rows.flatMap((row): GalleryItem[] => {
    const file = row[image]
    if (!isStoredFile(file) || !isPicture(file)) return []
    const key = holder && keyOf(holder, row)
    return [{ file, ...(key !== undefined && { key }) }]
  })
  if (!isStoredFile(cover) || !isPicture(cover)) return photos
  const same = (item: GalleryItem) => isStoredFile(item.file) && item.file.uri === cover.uri
  const key = photos.find(same)?.key
  return [{ file: cover, ...(key !== undefined && { key }) }, ...photos.filter((item) => !same(item))]
}
