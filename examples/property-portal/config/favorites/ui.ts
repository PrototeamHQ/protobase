import { l, view } from '@protobase/schema'
import type { favorites } from './data'

export const favoritesView = view<typeof favorites>('favorites')
  .title((r) => r.listing_id)
  .names({ singular: 'Favorite', plural: 'Favorites' })
  .nav({ group: 'Yours', order: 1 })
  .help('The listings you saved. Save one with "Save to favorites" on its page.')
  .fields((r) => ({ listing_id: r.listing_id.label('Listing'), created_at: r.created_at.label('Saved') }))
  .list((r) => ({ columns: [r.listing_id, r.created_at], sort: [[r.created_at, 'desc']] }))
  .layout((r) => [l.section('Favorite', [r.listing_id, r.created_at])])
  .actions((a) => [
    a.link('open_listing', { label: 'Open the listing', to: { kind: 'record', resource: 'listings', key: '{listing_id}' } }),
    a.remove('unsave', { label: 'Remove from favorites', confirm: 'Remove this listing from your favorites?' }),
  ])
