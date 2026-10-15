import { f, resource } from '@protobase/schema'
import { searchIssues } from './rules'

export const alertFrequencies = ['instant', 'daily', 'none'] as const

/**
 * members.saved_searches: a filter of the listings page a member saved, with the name they gave it, if any, and whether they hear of new listings that fit
 * it at once, in the morning digest or not at all. Theirs alone (`.own` on `user_id`). `seen_at` is when they last
 * opened its results: the listings published since are new to them. Unique: (user_id, filter).
 */
export const savedSearches = resource('saved_searches')
  .table('members.saved_searches')
  .fields({
    id: f.bigint().readOnly().filterable().sortable().dbDefault(),
    user_id: f.text().readOnly().filterable(),
    name: f.text().min(1).optional().sortable(),
    filter: f.text(),
    alert_frequency: f.enum(alertFrequencies).default('daily').filterable().sortable(),
    seen_at: f.timestamp().filterable().sortable().dbDefault(),
    created_at: f.timestamp().readOnly().filterable().sortable().dbDefault(),
  })
  .primaryKey((r) => r.id)
  .owner((r) => r.user_id)
  .search((r) => [r.name])
  .validate(searchIssues)
