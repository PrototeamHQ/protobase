import { sql } from 'kysely'
import { activeAdmin } from '../active-admin'
import { ddl } from '../ddl'
import type { StoreMigration } from './migration'

/** The indexes that find the other active admins and page through the users by creation; none on a view (`users.keyTable`). */
export const userIndexes: StoreMigration = {
  version: 12,
  name: 'user_indexes',
  title: 'The indexes that find the active admins and page through the users',
  tables: [],
  statements: ({ user, userDdl, userColumn: column }) =>
    userDdl([
      ddl`create index if not exists user_active_admin_idx on ${user} (id) where ${activeAdmin(sql.id(column('role')), sql.id(column('banned')))}`,
      ddl`create index if not exists user_created_at_id_idx on ${user} (${column('created_at')}, id)`,
    ]),
}
