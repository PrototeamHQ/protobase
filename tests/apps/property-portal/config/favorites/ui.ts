import { l, view } from '@protobase/schema'
import type { favorites } from './data'

/**
 * A member's favorites: the list page shows the listings they saved, in the listings' cards and map, and a visitor is
 * told what signing in gives there and by the heart on a listing's card.
 */
export const favoritesView = view<typeof favorites>('favorites')
  .title((r) => r.listing_id)
  .names({ singular: 'Favorite', plural: 'Favorites' })
  .nav({ group: 'Yours', order: 1 })
  .help('The listings you saved. Save one with the heart on its card, or "Save to favorites" on its page.')
  .fields((r) => ({ listing_id: r.listing_id.label('Listing'), created_at: r.created_at.label('Saved') }))
  .list((r) => ({ columns: [r.listing_id, r.created_at], sort: [[r.created_at, 'desc']] }))
  .listOf((r) => r.listing_id)
  .signIn({
    title: 'Keep the homes you like',
    description: 'Sign in to save listings to your favorites and find them again on any device.',
    benefits: ['Save a listing with the heart on its card', 'See all your saved homes on one page, on the map too', 'Add notes only you can read'],
    icon: 'heart',
  })
  .layout((r) => [l.section('Favorite', [r.listing_id, r.created_at])])
  .actions((a) => [
    a.link('open_listing', { label: 'Open the listing', to: { kind: 'record', resource: 'listings', key: '{listing_id}' } }),
    a.remove('unsave', { label: 'Remove from favorites', confirm: 'Remove this listing from your favorites?' }),
  ])
