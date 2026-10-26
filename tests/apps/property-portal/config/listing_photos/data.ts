import { f, resource } from '@protobase/schema'
import { photoVariants } from '../photo-variants'

/** market.listing_photos: the photos of a listing, in order. Unique: (listing_id, position). */
export const listingPhotos = resource('listing_photos')
  .table('market.listing_photos')
  .fields({
    id: f.bigint().readOnly().filterable().sortable().dbDefault(),
    listing_id: f.relation('listings').filterable().sortable(),
    position: f.integer().min(1).sortable(),
    photo: f.file().accept(['image/*']).public().placeholder('photo_placeholder').variants(photoVariants),
    photo_placeholder: f.text().readOnly().optional(),
    caption: f.text().optional(),
  })
  .primaryKey((r) => r.id)
