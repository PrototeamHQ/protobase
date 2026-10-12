import { f, resource } from '@protobase/schema'

/**
 * members.alerts: a published listing that fits one of a member's search profiles, recorded by the match-listing job.
 * `emailed_at` is when it went out by mail, at once or in the daily digest. Theirs alone (`.own` on `user_id`), which
 * Postgres keeps equal to the profile's owner. Unique: (search_profile_id, listing_id).
 */
export const alerts = resource('alerts')
  .table('members.alerts')
  .fields({
    id: f.bigint().readOnly().filterable().sortable().dbDefault(),
    user_id: f.text().readOnly().filterable(),
    search_profile_id: f.relation('search_profiles').readOnly().filterable().sortable(),
    listing_id: f.relation('listings').readOnly().filterable().sortable(),
    matched_at: f.timestamp().readOnly().filterable().sortable().dbDefault(),
    emailed_at: f.timestamp().readOnly().optional().filterable().sortable(),
    seen: f.boolean().default(false).filterable(),
  })
  .primaryKey((r) => r.id)
  .owner((r) => r.user_id)
