import type { AdminAuth } from './create-auth'
import { storeNames } from './store/store-names'
import { storeTableNames } from './store/table-names'

/**
 * The admin store's tables, which the assistant's queries and the app's resources must never read: the user table and
 * `storeTableNames`, and with `users.keyTable` the table under the user view too, such as Supabase's `auth.users`,
 * whose password hashes the view leaves out but the table holds.
 */
export const authStoreTables = (auth: AdminAuth) => {
  const { schema, users } = storeNames(auth)
  const own = [users.modelName, ...storeTableNames].map((name) => ({ schema, name }))
  return users.keyTable ? [...own, { schema: users.keyTable.schema, name: users.keyTable.table }] : own
}
