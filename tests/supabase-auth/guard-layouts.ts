import { Kysely, PostgresDialect } from 'kysely'
import pg from 'pg'
import { f, resource } from '@protobase/schema'
import type { CreateAuthOptions } from '@protobase/server'
import { createAuth } from '@protobase/server/internal'
import { supabaseUsers } from '../../packages/cli/src/supabase/auth-config'

// Auth layouts other than the wizard's, on the stack's database, for what they guard: only the store's names are
// read, so its tables need not exist.

type UserTableOptions = NonNullable<CreateAuthOptions['users']>

/** A pool on `url`, with `searchPath` as the search path when given. */
const poolOn = (url: string, searchPath?: string) => new pg.Pool({ connectionString: url, max: 1, ...(searchPath && { options: `-c search_path=${searchPath}` }) })

/** A Kysely on `url`, with `searchPath` as the search path when given; `destroy` ends its pool. */
export const kyselyOn = (url: string, searchPath?: string) => new Kysely<any>({ dialect: new PostgresDialect({ pool: poolOn(url, searchPath) }) })

/** An auth whose store is in `schema`, with `users`, on the database at `url`; `close` ends its pool. */
export const authOn = (url: string, schema: string, users: UserTableOptions) => {
  const pool = poolOn(url)
  const auth = createAuth({ database: { dialect: new PostgresDialect({ pool }), type: 'postgres', schemaName: schema }, baseURL: 'http://localhost', secret: 'guard-layouts-test-secret-0123456789', mailer: false, users })
  return { auth, close: () => pool.end() }
}

/** `protobase import supabase`'s layout: the store in `auth`, beside Supabase's own auth.users. */
export const importedUsers: UserTableOptions = supabaseUsers.users

/** A project whose user table is a view over a table in `public`, the schema of its own resources, guarding none. */
export const publicKeyTable: UserTableOptions = { table: 'users', keyTable: { schema: 'public', table: 'people' } }

/** A resource over `table`, with an id. */
export const over = (table: string) => resource(table.replaceAll(/\W/g, '_')).table(table).fields({ id: f.uuid() }).primaryKey((r) => r.id).toModel()
