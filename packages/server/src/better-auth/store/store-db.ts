import { Kysely, PostgresDialect, type PostgresPool } from 'kysely'
import type { AdminAuth } from '../create-auth'

/**
 * A Kysely on the admin store's connections: `createAuth`'s `database`, a `pg` Pool or `{ dialect, type: 'postgres' }`.
 * The pool is the app's, so it is never destroyed here.
 */
export const storeDb = ({ options: { database } }: AdminAuth) => {
  if (database && typeof database === 'object' && 'dialect' in database) return new Kysely<any>({ dialect: database.dialect })
  if (database && typeof database === 'object' && 'connect' in database) return new Kysely<any>({ dialect: new PostgresDialect({ pool: database as unknown as PostgresPool }) })
  throw new Error("The admin store's database is neither a pg Pool nor { dialect, type: 'postgres' }")
}
