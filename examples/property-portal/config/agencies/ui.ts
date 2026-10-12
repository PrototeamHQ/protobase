import { l, view } from '@protobase/schema'
import type { agencies } from './data'

export const agenciesView = view<typeof agencies>('agencies')
  .title((r) => r.name)
  .names({ singular: 'Agency', plural: 'Agencies' })
  .nav({ group: 'Browse', order: 2 })
  .fields((r) => ({
    place_id: r.place_id.label('Office in'),
    website: r.website.label('Website'),
  }))
  .list((r) => ({ columns: [r.name, r.place_id, r.phone, r.website], sort: [[r.name, 'asc']], search: [r.name] }))
  .filters((r, w) => [w.facets(r.place_id, { search: true })])
  .layout((r) => [
    l.section('Agency', [r.name, r.place_id]),
    l.section('Contact', [r.phone, r.email, r.website]),
    l.related('Listings', { resource: 'listings', field: 'agency_id', sort: 'published_at desc', columns: ['address', 'place_id', 'offer_type', 'price', 'status'] }),
  ])
