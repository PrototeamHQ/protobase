import { f, resource } from '@protobase/schema'

/**
 * members.notes: what a member writes down about a listing. Only its writer reads or changes it (`notes.*.own` on
 * `user_id`), and a new note is theirs whatever the request says.
 */
export const notes = resource('notes')
  .table('members.notes')
  .fields({
    id: f.bigint().readOnly().filterable().sortable().dbDefault(),
    user_id: f.text().readOnly().filterable(),
    listing_id: f.relation('listings').filterable().sortable(),
    body: f.text().min(1),
    created_at: f.timestamp().readOnly().filterable().sortable().dbDefault(),
    updated_at: f.timestamp().readOnly().filterable().sortable().dbDefault(),
  })
  .primaryKey((r) => r.id)
  .owner((r) => r.user_id)
  .search((r) => [r.body])
