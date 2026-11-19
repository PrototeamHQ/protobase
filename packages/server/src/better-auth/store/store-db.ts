import { Kysely, PostgresDialect, type PostgresPool } from 'kysely'
import type { StoreOptions } from './store-names'

/**
 * The Kysely the admin store's queries run through: `createAuth`'s `database`, the app's own Kysely
 * (`{ db, type: 'postgres' }`), a `pg` Pool or `{ dialect, type: 'postgres' }`. The app's Kysely is used as it is, its
 * plugins included; the pool is the app's, so it is never destroyed here.
 */
export const storeDb = ({ options: { database } }: StoreOptions): Kysely<any> => {
  if (database && typeof database === 'object' && 'db' in database) return database.db
  if (database && typeof database === 'object' && 'dialect' in database) return new Kysely<any>({ dialect: database.dialect })
  if (database && typeof database === 'object' && 'connect' in database) return new Kysely<any>({ dialect: new PostgresDialect({ pool: database as unknown as PostgresPool }) })
  throw new Error("The admin store's database is neither a Kysely, a pg Pool nor { dialect, type: 'postgres' }")
}

/**
 * The admin store's connections without the app's query plugins: what its migrations and schema checks read and
 * write, which name the store's tables as they are in the database.
 */
export const plainStoreDb = (auth: StoreOptions) => storeDb(auth).withoutPlugins()
