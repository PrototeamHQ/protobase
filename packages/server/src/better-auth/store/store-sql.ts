import { sql, type Kysely, type RawBuilder } from 'kysely'
import { namesOf } from '../names/names-plugin'
import type { ResolvedNames } from '../names/resolve-names'
import type { AuthContext } from '../organizations/store'
import { storeDb } from './store-db'

// The questions Better Auth's adapter cannot put, such as a count over a comma list of roles, a join, a keyset page or
// a statement over a set of rows, go to the store as SQL, every table and column named as the store's names resolve it.

/** The admin store, for a question Protobase asks it in SQL. */
export type StoreSql = {
  db: Kysely<any>
  /** A table of the store, by internal name, with its columns: `table('member').columns.user_id`. */
  table: ResolvedNames['table']
  /** A new row's id, made by Postgres: a uuid, as text where the ids are text. */
  newId: RawBuilder<unknown>
}

type Source = Pick<AuthContext, 'options'>

// One Kysely per instance, as its options are made once.
const made = new WeakMap<object, StoreSql>()

/** The store of an auth instance, from its context. */
export const storeSqlOf = (context: Source): StoreSql => {
  const known = made.get(context.options)
  if (known) return known
  const store: StoreSql = {
    db: storeDb(context),
    table: namesOf(context).table,
    newId: context.options.advanced?.database?.generateId === 'uuid' ? sql`gen_random_uuid()` : sql`gen_random_uuid()::text`,
  }
  made.set(context.options, store)
  return store
}
