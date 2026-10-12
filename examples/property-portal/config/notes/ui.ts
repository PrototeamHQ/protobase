import { l, view } from '@protobase/schema'
import type { notes } from './data'

export const notesView = view<typeof notes>('notes')
  .title((r) => r.body)
  .names({ singular: 'Note', plural: 'Notes' })
  .nav({ group: 'Yours', order: 3 })
  .help('Only you see your notes.')
  .fields((r) => ({
    listing_id: r.listing_id.label('Listing'),
    body: r.body.label('Note'),
    updated_at: r.updated_at.label('Changed'),
  }))
  .list((r) => ({ columns: [r.listing_id, r.body, r.updated_at], sort: [[r.updated_at, 'desc']], search: [r.body] }))
  .filters((r, w) => [w.facets(r.listing_id, { search: true })])
  .layout((r) => [l.section('Note', [r.listing_id, r.body]), l.sidebar([r.listing_id, r.created_at, r.updated_at])])
