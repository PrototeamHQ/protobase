import type { ScopedDb } from '@protobase/query'
import { Kysely, PostgresDialect, type PostgresPool } from 'kysely'
import type { StoreOptions } from './store-names'

/**
 * The Kysely the admin store's queries run through: `createAuth`'s `database`, the app's own Kysely
 * (`{ db, type: 'postgres' }`), a `pg` Pool or `{ dialect, type: 'postgres' }`. The app's Kysely is used as it is, its
 * plugins included, kept to an organization when it is a `ScopedDb`; the pool is the app's, so it is never destroyed here.
 */
export const storeDb = ({ options: { database } }: StoreOptions): Kysely<any> => {
  if (database && typeof database === 'object' && 'db' in database) return database.db
  if (database && typeof database === 'object' && 'dialect' in database) return new Kysely<any>({ dialect: database.dialect })
  if (database && typeof database === 'object' && 'connect' in database) return new Kysely<any>({ dialect: new PostgresDialect({ pool: database as unknown as PostgresPool }) })
  throw new Error("The admin store's database is neither a Kysely, a pg Pool nor { dialect, type: 'postgres' }")
}

/**
 * `db` without the app's query plugins, for reads and writes that name tables as they are in the database. A database
 * kept to an organization (`ScopedDb`) leaves its scope by name first, saying why (`reason`), as it refuses
 * `withoutPlugins` alone.
 */
export const withoutAppPlugins = (db: Kysely<any>, reason: string) => {
  const scoped = db as Kysely<any> & Partial<Pick<ScopedDb, 'unscoped'>>
  const plain = typeof scoped.unscoped === 'function' ? scoped.unscoped(reason) : db
  return plain.withoutPlugins()
}

/** The admin store's connections without the app's query plugins: what its migrations and schema checks read and write. */
export const plainStoreDb = (auth: StoreOptions) => withoutAppPlugins(storeDb(auth), "the store's migrations and schema checks name its tables as they are")
