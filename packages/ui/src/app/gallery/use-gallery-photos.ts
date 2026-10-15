import { useQuery } from '@tanstack/react-query'
import { createWhere, printFilter, type GalleryModel } from '@protobase/schema'
import { useClient } from '../../data/api-provider'
import { keys } from '../../data/query-keys'
import { useAdminMeta } from '../meta-gate'
import { galleryItems, galleryPhotoLimit } from './gallery-items'

const where = createWhere()

/**
 * A gallery's photos: the record's own image, then the photo records that point at it, read with the list API under
 * the user's own access, so its row filters and readable fields apply. Without the photos' resource in `/meta`, the
 * user cannot list them, and the record's image is all there is.
 */
export const useGalleryPhotos = (item: GalleryModel, record: Record<string, unknown>, recordKey: string) => {
  const client = useClient()
  const { resources } = useAdminMeta()
  const holder = item.photos ? resources[item.photos.resource] : undefined
  const filter = item.photos ? printFilter(where.eq(item.photos.field, recordKey)) : ''
  const sort = item.photos?.sort ?? ''
  const rows = useQuery({
    queryKey: keys.list(holder?.name ?? '', filter, sort, galleryPhotoLimit, 'gallery'),
    enabled: holder !== undefined,
    queryFn: async () => (await client.list(holder!.name, { filter, ...(sort && { orderBy: sort }), pageSize: galleryPhotoLimit })).items,
  })
  const cover = item.image === undefined ? undefined : record[item.image]
  return {
    holder,
    items: galleryItems(cover, rows.data ?? [], item.photos?.image, holder),
    isPending: holder !== undefined && rows.isPending,
    error: rows.error,
  }
}
