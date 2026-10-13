import { checkFilter, createWhere, type CardPhotosModel, type ResourceModel } from '@protobase/schema'
import { cardPhotoLimit } from '@protobase/schema/internal'
import { relatedRows } from '@protobase/query'
import type { Deps } from './deps'
import { checkedSort } from './filter-input'
import { presentFiles } from './files/present'
import { badRequest } from './problem'
import { readScope, requestAccess, type RequestAccess } from './request-access'
import { exposeRow } from './rows'
import { readTransaction } from './transactions'
import type { Row, Session } from './types'
import { cardPhotosErrors } from './view-card-photos'

const where = createWhere()

/**
 * A list's `photos`, as a cards display's `photos` names them. `access` is the caller's access to their resource,
 * absent when they could not list those photos themselves, so every record goes without.
 */
export type PhotosRequest = { photos: CardPhotosModel; access?: RequestAccess }

/** Each record's photos, by its key as text, as file objects; a record without any is absent. */
export type RecordPhotos = Record<string, unknown[]>

const invalid = (parameter: string, message: string) => badRequest('invalid-parameter', `Invalid ${parameter}: ${message}`, { errors: [{ parameter, message }] })

/**
 * Checks `photos` (`resource.field.image`) and `photos_order_by` against the listed resource and the caller's access
 * to the photos' resource. The caller gets photos only where a cards display would keep its `photos` for them: they
 * can list that resource, and read and use `field`, `image` and the sorted fields. Anything less answers no photos
 * rather than an error, so the parameter never tells a resource or field exists.
 */
export const photosRequest = async (deps: Deps, session: Session, model: ResourceModel, photos?: string, orderBy?: string): Promise<PhotosRequest | undefined> => {
  if (photos === undefined) {
    if (orderBy !== undefined) throw invalid('photos_order_by', 'Name the photos it orders with photos')
    return undefined
  }
  const [resource, field, image, ...rest] = photos.split('.').map((part) => part.trim())
  if (!resource || !field || !image || rest.length > 0) throw invalid('photos', 'Name the photos\' resource, its relation to this one and its file field, as resource.field.image')
  const named: CardPhotosModel = { resource, field, image, ...(orderBy?.trim() && { sort: orderBy }) }
  const target = deps.registry.find(resource)
  if (!target) return { photos: named }
  const access = await requestAccess(deps, target, session)
  const models = { [resource]: access.model, [model.name]: model }
  const usable = access.resolved.operations.list && cardPhotosErrors(named, model.name, models).length === 0
  return usable ? { photos: named, access } : { photos: named }
}

// The fields read of each photo: the key its download link names, the image, and the image's placeholder when readable.
const photoColumns = ({ photos, access }: Required<PhotosRequest>) => {
  const placeholder = access.model.fields[photos.image]!.file?.placeholder
  return [...access.full.primaryKey, photos.image, ...(placeholder === undefined ? [] : [placeholder])].filter((name) => Object.hasOwn(access.model.fields, name))
}

/**
 * The first photos of each row, at most `cardPhotoLimit`, read as the caller lists the photos' resource: its tenant,
 * row filter, soft delete and readable fields apply, and its files are linked for them. One query reads them all, after
 * the scan guard has checked an index serves the lookup.
 */
export const recordPhotos = async (deps: Deps, request: PhotosRequest, model: ResourceModel, rows: Row[]): Promise<{ photos: RecordPhotos; warning?: string }> => {
  const keyField = model.primaryKey[0]!
  const keys = [...new Set(rows.map((row) => row[keyField]).filter((key) => key !== null && key !== undefined).map(String))]
  if (!request.access || keys.length === 0) return { photos: {} }
  const { photos, access } = request as Required<PhotosRequest>
  const sort = checkedSort(access.model, photos.sort)
  const filter = checkFilter(access.model, where.in(photos.field, keys))
  if (!filter.ok) throw new Error(`Keys of "${model.name}" do not make a filter of "${photos.resource}": ${filter.errors[0]!.message}`)
  const scope = readScope(access)
  const warning = await deps.guard(access.entry, { filter: filter.filter, ...(sort && { sort }), limit: cardPhotoLimit }, { model: access.model, scope })
  const found = await readTransaction(deps.db, deps.statementTimeoutMs, (trx) =>
    relatedRows(trx, access.model, { field: photos.field, values: keys, columns: photoColumns({ photos, access }), ...(sort && { sort }), limit: cardPhotoLimit }, scope),
  )
  const shown = await presentFiles(access, found.map((row) => exposeRow(access.model, row)))
  const byRecord: RecordPhotos = {}
  for (const row of shown) {
    if (row[photos.image] === null || row[photos.image] === undefined) continue
    const key = String(row[photos.field])
    byRecord[key] = [...(byRecord[key] ?? []), row[photos.image]]
  }
  return { photos: byRecord, ...(warning && { warning }) }
}
