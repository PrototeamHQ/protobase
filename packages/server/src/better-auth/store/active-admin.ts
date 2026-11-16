import { sql, type RawBuilder } from 'kysely'
import type { StoreSql } from './store-sql'

/** The names in a user's role, a comma list that may be braced (`{admin,sales}`) as `parseRoles` reads it: a text[]. */
export const roleNames = (role: RawBuilder<unknown>) => sql`string_to_array(replace(btrim(coalesce(${role}, 'user'), '{}'), ' ', ''), ',')`

/**
 * A user who is an active admin, in SQL: `admin` is one of the names in their role (`roleNames`), so `superadmin` is
 * not, and they are not blocked. The partial index `user_active_admin_idx` (migration 11) has this predicate, and
 * Postgres uses it only for a query that repeats it word for word: changing it needs a new index.
 */
export const activeAdmin = (role: RawBuilder<unknown>, banned: RawBuilder<unknown>) =>
  sql`${banned} is not true and 'admin' = any(${roleNames(role)})`

/** Whether an active admin other than the user `except` exists, asked of Postgres through `user_active_admin_idx`. */
export const activeAdminExists = async (store: StoreSql, { except }: { except: string }) => {
  const admin = activeAdmin(store.userColumn('role'), store.userColumn('banned'))
  const { rows } = await sql<{ found: boolean }>`select exists (select from ${store.user} where id <> ${except} and ${admin}) as found`.execute(store.db)
  return rows[0]!.found
}
