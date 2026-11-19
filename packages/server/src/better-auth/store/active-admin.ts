import { sql, type OperationNode } from 'kysely'
import type { StoreSql } from './store-sql'

/** A column or another fragment of SQL. */
type SqlPart = { toOperationNode: () => OperationNode }

/**
 * The names in a user's role as `parseRoles` reads them, a text[]: a comma list that may be braced (`{admin,"sales"}`),
 * each name without the spaces and the quote at either end. The braces go, then the spaces and quote at the list's ends,
 * then the list splits at each comma with the quotes and spaces beside it; spaces inside a name stay (`ad min`).
 */
export const roleNames = (role: SqlPart) =>
  sql`regexp_split_to_array(regexp_replace(regexp_replace(coalesce(${role}, 'user'), '^\\s*\\{(.*)\\}\\s*$', '\\1'), '^\\s*"?|"?\\s*$', '', 'g'), '"?\\s*,\\s*"?')`

/**
 * A user who is an active admin, in SQL: `admin` is one of the names in their role (`roleNames`), so `superadmin` is
 * not, and they are not blocked. The partial index `user_active_admin_idx` (migration 12) has this predicate, and
 * Postgres uses it only for a query that repeats it word for word: changing it needs a new index.
 */
export const activeAdmin = (role: SqlPart, banned: SqlPart) =>
  sql`${banned} is not true and 'admin' = any(${roleNames(role)})`

/** Whether an active admin other than the user `except` exists, asked of Postgres through `user_active_admin_idx`. */
export const activeAdminExists = async (store: StoreSql, { except }: { except: string }) => {
  const user = store.table('user')
  const admin = activeAdmin(user.columns.role, user.columns.banned)
  const { rows } = await sql<{ found: boolean }>`select exists (select from ${user} where id <> ${except} and ${admin}) as found`.execute(store.db)
  return rows[0]!.found
}
