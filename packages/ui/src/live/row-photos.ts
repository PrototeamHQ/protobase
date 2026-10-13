import type { CardPhotosModel, ResourceModel, ViewModel } from '@protobase/schema'
import type { RecordPhotos } from '@protobase/client'

/** Where a loaded row keeps its photos, beside its fields, as it keeps its `id`. */
export const photosKey = '$photos'

/** The photos a list's rows load with: those its cards displays name, which the server checks they all share. */
export const listPhotos = (view: ViewModel | undefined): CardPhotosModel | undefined => {
  for (const display of view?.list?.displays ?? []) if (display.kind === 'cards' && display.photos) return display.photos
  return undefined
}

/** The rows, each with its record's photos from a list call's `photos`, when the call asked for them; none for a record it left out. */
export const withPhotos = (model: ResourceModel, rows: Array<Record<string, unknown>>, photos: RecordPhotos | undefined) => {
  if (photos === undefined || model.primaryKey.length !== 1) return rows
  const key = model.primaryKey[0]!
  return rows.map((row) => ({ ...row, [photosKey]: photos[String(row[key])] ?? [] }))
}
