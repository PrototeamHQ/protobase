import { l, view } from '@protobase/schema'
import type { alerts } from './data'

export const alertsView = view<typeof alerts>('alerts')
  .title((r) => r.listing_id)
  .names({ singular: 'Alert', plural: 'Alerts' })
  .nav({ group: 'Yours', order: 2 })
  .help('New listings that fit your search profiles.')
  .fields((r) => ({
    listing_id: r.listing_id.label('Listing'),
    search_profile_id: r.search_profile_id.label('Search profile'),
    matched_at: r.matched_at.label('Found'),
    emailed_at: r.emailed_at.label('Mailed').help('Empty until it is mailed, or while the app sends no mail.'),
  }))
  .list((r) => ({ columns: [r.listing_id, r.search_profile_id, r.matched_at, r.emailed_at, r.seen], sort: [[r.matched_at, 'desc']] }))
  .filters((r, w) => [w.toggle(r.seen), w.facets(r.search_profile_id), w.dateRange(r.matched_at, { presets: ['7d', '30d', '90d'] })])
  .layout((r) => [l.section('Alert', [r.listing_id, r.search_profile_id, r.matched_at, r.emailed_at, r.seen]), l.sidebar([r.seen, r.matched_at])])
  .actions((a) => [
    a.link('open_listing', { label: 'Open the listing', to: { kind: 'record', resource: 'listings', key: '{listing_id}' } }),
    a.update('mark_seen', { label: 'Mark as seen', set: { seen: true } }),
  ])
