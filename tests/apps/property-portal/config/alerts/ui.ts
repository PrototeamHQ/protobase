import { l, view } from '@protobase/schema'
import type { alerts } from './data'

export const alertsView = view<typeof alerts>('alerts')
  .title((r) => r.listing_id)
  .names({ singular: 'Alert', plural: 'Alerts' })
  .nav({ group: 'Yours', order: 3 })
  .help('The new listings your saved searches found, and when they were mailed.')
  .fields((r) => ({
    listing_id: r.listing_id.label('Listing'),
    saved_search_id: r.saved_search_id.label('Search'),
    matched_at: r.matched_at.label('Found'),
    emailed_at: r.emailed_at.label('Mailed').help('Empty until it is mailed, while the app sends no mail, or when the search sent no email as the listing was found.'),
  }))
  .list((r) => ({ columns: [r.listing_id, r.saved_search_id, r.matched_at, r.emailed_at], sort: [[r.matched_at, 'desc']] }))
  .filters((r, w) => [w.facets(r.saved_search_id), w.dateRange(r.matched_at, { presets: ['7d', '30d', '90d'] })])
  .layout((r) => [l.section('Alert', [r.listing_id, r.saved_search_id, r.matched_at, r.emailed_at]), l.sidebar([r.matched_at, r.emailed_at])])
  .actions((a) => [a.link('open_listing', { label: 'Open the listing', to: { kind: 'record', resource: 'listings', key: '{listing_id}' } })])
