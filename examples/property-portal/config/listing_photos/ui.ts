import { l, view } from '@protobase/schema'
import type { listingPhotos } from './data'

/**
 * Reached from a listing's page, where the lightbox shows a photo's caption beside it; the sidebar leaves the photos
 * out. Its own page shows the photo, then its caption and listing.
 */
export const listingPhotosView = view<typeof listingPhotos>('listing_photos')
  .names({ singular: 'Photo', plural: 'Photos' })
  .nav({ hidden: true })
  .recordMode('read')
  .helpWhen('editing')
  .fields((r) => ({ listing_id: r.listing_id.label('Listing'), position: r.position.help('1 is shown first.') }))
  .list((r, d) => ({ columns: [r.listing_id, r.position, r.caption, r.photo], sort: [[r.listing_id, 'asc'], [r.position, 'asc']], displays: [d.cards({ image: r.photo, title: r.caption, subtitle: r.listing_id })] }))
  .layout((r) => [l.gallery('Photo', { image: r.photo }), l.section('Photo details', [r.caption, r.listing_id])])

/** Admins also place the photo among the listing's and upload its file. */
export const adminListingPhotosView = listingPhotosView
  .layout((r) => [l.gallery('Photo', { image: r.photo }), l.section('Photo details', [r.caption, r.listing_id]), l.section('Order and file', [r.position, r.photo])])
  .forRoles(['admin'])
