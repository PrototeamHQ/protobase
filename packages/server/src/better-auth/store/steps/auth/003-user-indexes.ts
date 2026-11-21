import { activeAdmin } from '../../active-admin'
import { ddl } from '../../ddl'
import type { Step } from '../step'

/** The indexes that find the other active admins and page through the users by creation; none on a view (`users.keyTable`). */
export const userIndexes: Step = {
  step: 3,
  version: 12,
  name: 'user_indexes',
  title: 'The indexes that find the active admins and page through the users',
  tables: [],
  statements: ({ table, userDdl }) => {
    const user = table('user')
    const u = user.columns
    return userDdl([
      ddl`create index if not exists ${user.index('user_active_admin_idx')} on ${user} (id) where ${activeAdmin(u.role, u.banned)}`,
      ddl`create index if not exists ${user.index('user_created_at_id_idx')} on ${user} (${u.created_at}, id)`,
    ])
  },
}
