import type { Sql } from '../db/connect'

/**
 * Schemas of a Supabase database that belong to the platform rather than the app: its services' own (Realtime, Vault,
 * GraphQL, webhooks, migrations, the pooler) and those of its extensions, which the migration makes with them (pgmq's
 * holds only its own tables, but is no member of it). The import leaves them behind.
 */
export const serviceSchemas = ['extensions', 'graphql', 'graphql_public', 'realtime', '_realtime', 'vault', 'pgsodium', 'pgsodium_masks', 'supabase_functions', 'supabase_migrations', 'cron', 'net', 'pgmq', 'pgbouncer', '_analytics', 'pgtle']

/**
 * Supabase Auth's and Storage's own schemas, which are the platform's too, but the app's tables point at them and its
 * triggers and policies live in them, so the import carries them over; their tables are no resources.
 */
export const authStorageSchemas = ['auth', 'storage']

/** What marks a database as Supabase's: its auth, storage and migrations schemas and its roles. */
export const databaseMarkers = async (sql: Sql) => {
  const [row] = await sql<{ schemas: string[]; roles: string[] }[]>`
    select
      array(select nspname::text from pg_namespace where nspname in ('auth', 'storage', 'supabase_migrations') order by 1) as schemas,
      array(select rolname::text from pg_roles where rolname in ('anon', 'authenticated', 'service_role', 'supabase_admin') order by 1) as roles
  `
  return row!
}

/** What `markers` lack of a Supabase database, its auth and storage schemas and its own admin role: nothing for one. */
export const missingMarkers = (markers: { schemas: string[]; roles: string[] }) => [
  ...authStorageSchemas.filter((schema) => !markers.schemas.includes(schema)).map((schema) => `schema ${schema}`),
  ...(markers.roles.includes('supabase_admin') ? [] : ['role supabase_admin']),
]
