import { l, view } from '@protobase/schema'
import type { listingPhotos } from './data'

/** Reached from a listing's page; the sidebar leaves the photos out. */
export const listingPhotosView = view<typeof listingPhotos>('listing_photos')
  .names({ singular: 'Photo', plural: 'Photos' })
  .nav({ hidden: true })
  .fields((r) => ({ listing_id: r.listing_id.label('Listing'), position: r.position.help('1 is shown first.') }))
  .list((r, d) => ({ columns: [r.listing_id, r.position, r.caption, r.photo], sort: [[r.listing_id, 'asc'], [r.position, 'asc']], displays: [d.cards({ image: r.photo, title: r.caption, subtitle: r.listing_id })] }))
  .layout((r) => [l.section('Photo', [r.listing_id, r.position, r.photo, r.caption])])
