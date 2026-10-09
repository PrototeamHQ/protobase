import { PGlite } from '@electric-sql/pglite'
import { getMigrations } from 'better-auth/db/migration'
import { PGliteDialect } from 'kysely-pglite-dialect'
import { fromSnapshot } from './pglite-snapshot'
import { createAuth } from '@protobase/server'

/** A Better Auth store with its tables and nothing in them: no users, no signing keys. */
export const buildAuthPg = async () => {
  const pg = new PGlite()
  const auth = createAuth({ database: { dialect: new PGliteDialect(pg), type: 'postgres' }, baseURL: 'http://localhost', secret: 'auth-store-snapshot-secret-0123456789', mailer: false })
  await (await getMigrations(auth.options)).runMigrations()
  return pg
}

/** A migrated, empty Better Auth store, loaded from the global setup's dump: no cold start and no migrations. */
export const createAuthStore = () => fromSnapshot('auth', buildAuthPg)
