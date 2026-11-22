import { ddl } from '../../ddl'
import type { Step } from '../step'

/**
 * The indexes the people a comment may mention are found by: the users by name, and by a part of it whatever its case,
 * through pg_trgm. None on a view (`users.keyTable`).
 */
export const userNameSearch: Step = {
  step: 5,
  version: 14,
  name: 'user_name_search',
  title: 'The indexes that find the users by a part of their name and list them by name',
  tables: [],
  statements: ({ table, userDdl }) => {
    const user = table('user')
    return userDdl([
      ddl`create extension if not exists pg_trgm`,
      ddl`create index if not exists ${user.index('user_name_id_idx')} on ${user} (${user.columns.name}, id)`,
      ddl`create index if not exists ${user.index('user_name_trgm_idx')} on ${user} using gin (${user.columns.name} gin_trgm_ops)`,
    ])
  },
}
