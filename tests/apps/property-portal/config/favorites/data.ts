import { f, resource } from '@protobase/schema'

/** members.favorites: a listing a member saved, theirs alone (`.own` on `user_id`). Unique: (user_id, listing_id). */
export const favorites = resource('favorites')
  .table('members.favorites')
  .fields({
    id: f.bigint().readOnly().filterable().sortable().dbDefault(),
    user_id: f.text().readOnly().filterable(),
    listing_id: f.relation('listings').filterable().sortable(),
    created_at: f.timestamp().readOnly().filterable().sortable().dbDefault(),
  })
  .primaryKey((r) => r.id)
  .owner((r) => r.user_id)
