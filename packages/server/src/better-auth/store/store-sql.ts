import { sql, type Kysely, type RawBuilder } from 'kysely'
import type { AuthContext } from '../organizations/store'
import { storeDb } from './store-db'

// The questions Better Auth's adapter cannot put, such as a count over a comma list of roles, a join, a keyset page or
// a statement over a set of rows, go to the store as SQL. The user table and its columns are named as the app
// configures them (`users`), every other table and column as the migrations spell them out.

/** The admin store, for a question Protobase asks it in SQL. */
export type StoreSql = {
  db: Kysely<any>
  /** A table of the store, in its schema. */
  table: (name: string) => RawBuilder<unknown>
  /** The user table, or the view over another system's (`users.keyTable`), in the store's schema. */
  user: RawBuilder<unknown>
  /** A column of the user table, by Better Auth's field name: `userColumn('banExpires')`. */
  userColumn: (field: string) => RawBuilder<unknown>
  /** A new row's id, made by Postgres: a uuid, as text where the ids are text. */
  newId: RawBuilder<unknown>
}

type Source = Pick<AuthContext, 'options' | 'tables'>

// One Kysely per instance, as its options are made once.
const made = new WeakMap<object, StoreSql>()

/** The store of an auth instance, from its context. */
export const storeSqlOf = (context: Source): StoreSql => {
  const known = made.get(context.options)
  if (known) return known
  const { database } = context.options as { database?: unknown }
  const schema = database && typeof database === 'object' && 'schemaName' in database ? (database.schemaName as string | undefined) : undefined
  const table = (name: string) => (schema === undefined ? sql.id(name) : sql.id(schema, name))
  const users = context.tables.user!
  const store: StoreSql = {
    db: storeDb(context),
    table,
    user: table(users.modelName),
    userColumn: (field) => sql.id(field === 'id' ? 'id' : (users.fields[field]?.fieldName ?? field)),
    newId: context.options.advanced?.database?.generateId === 'uuid' ? sql`gen_random_uuid()` : sql`gen_random_uuid()::text`,
  }
  made.set(context.options, store)
  return store
}
