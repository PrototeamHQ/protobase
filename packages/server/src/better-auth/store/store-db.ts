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
 * The admin store's connections without the app's query plugins: what its migrations and schema checks read and
 * write, which name the store's tables as they are in the database. A store kept to an organization (`ScopedDb`)
 * leaves its scope by name first, as it refuses `withoutPlugins` alone.
 */
export const plainStoreDb = (auth: StoreOptions) => {
  const db = storeDb(auth) as Kysely<any> & Partial<Pick<ScopedDb, 'unscoped'>>
  const plain = typeof db.unscoped === 'function' ? db.unscoped("the store's migrations and schema checks name its tables as they are") : db
  return plain.withoutPlugins()
}
