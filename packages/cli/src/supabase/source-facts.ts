import type { Sql } from '../db/connect'
import type { SourceExtension } from './extensions'
import type { DumpedTable } from './load-script'

/**
 * Schemas of a Supabase database that belong to the platform rather than the app: its services' own (Realtime, Vault,
 * GraphQL, webhooks, migrations, the pooler) and those of its extensions, which the migration makes with them (pgmq's
 * holds only its own tables, but is no member of it). auth and storage are the platform's too, but the app's tables
 * point at them and its triggers and policies live in them, so the import carries them over.
 */
const platformSchemas = ['extensions', 'graphql', 'graphql_public', 'realtime', '_realtime', 'vault', 'pgsodium', 'pgsodium_masks', 'supabase_functions', 'supabase_migrations', 'cron', 'net', 'pgmq', 'pgbouncer', '_analytics', 'pgtle']

/** The tables in auth and storage that record the platform's own migrations, which Protobase never runs. */
export const platformMigrationTables = ['auth.schema_migrations', 'storage.migrations']

/** What marks a database as Supabase's: its auth, storage and migrations schemas and its roles. */
export const databaseMarkers = async (sql: Sql) => {
  const [row] = await sql<{ schemas: string[]; roles: string[] }[]>`
    select
      array(select nspname::text from pg_namespace where nspname in ('auth', 'storage', 'supabase_migrations') order by 1) as schemas,
      array(select rolname::text from pg_roles where rolname in ('anon', 'authenticated', 'service_role', 'supabase_admin') order by 1) as roles
  `
  return row!
}

/** auth, storage and every schema the app made, which the dumps take. */
export const appSchemas = async (sql: Sql) => {
  const rows = await sql<{ name: string }[]>`
    select n.nspname as name from pg_namespace n
    where not starts_with(n.nspname, 'pg_') and n.nspname <> 'information_schema' and n.nspname <> all(${platformSchemas})
      and not exists (select 1 from pg_depend d where d.classid = 'pg_namespace'::regclass and d.objid = n.oid and d.deptype = 'e')
    order by 1
  `
  return rows.map((row) => row.name)
}

/**
 * The tables of `schemas` the data dump fills, each with its rows counted now: its own rows, as pg_dump copies them,
 * without those of tables inheriting from it, such as a timescaledb hypertable's chunks.
 */
export const dumpedTables = async (sql: Sql, schemas: string[]): Promise<DumpedTable[]> => {
  const tables = await sql<{ schema: string; table: string }[]>`
    select n.nspname as schema, c.relname as table from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where c.relkind = 'r' and n.nspname = any(${schemas}) and n.nspname || '.' || c.relname <> all(${platformMigrationTables})
      and not exists (select 1 from pg_depend d where d.classid = 'pg_class'::regclass and d.objid = c.oid and d.deptype = 'e')
    order by 1, 2
  `
  const counted: DumpedTable[] = []
  for (const table of tables) {
    const [row] = await sql<{ rows: string }[]>`select count(*) as rows from only ${sql(table.schema)}.${sql(table.table)}`
    counted.push({ ...table, rows: Number(row!.rows) })
  }
  return counted
}

/** The size on disk of `tables`, with their indexes and TOAST, in bytes. */
export const tablesSize = async (sql: Sql, tables: DumpedTable[]) => {
  const names = tables.map((table) => `${table.schema}.${table.table}`)
  const [row] = await sql<{ bytes: string | null }[]>`
    select sum(pg_total_relation_size(c.oid)) as bytes from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname || '.' || c.relname = any(${names})
  `
  return Number(row!.bytes ?? 0)
}

export const extensions = (sql: Sql) => sql<SourceExtension[]>`
  select e.extname as name, n.nspname as schema from pg_extension e join pg_namespace n on n.oid = e.extnamespace order by 1
`

/** Whether the importing role may read `table`, which exists only when its feature is on. */
const readable = async (sql: Sql, table: string) => {
  const [row] = await sql<{ readable: boolean }[]>`select to_regclass(${table}) is not null and has_table_privilege(${table}, 'select') as readable`
  return row!.readable
}

export type CronJob = { id: number; name: string | null; schedule: string; command: string; active: boolean; database: string; local: boolean }

/**
 * pg_cron's jobs, which the cron schema holds and the dump leaves out, each `local` when it runs in this database;
 * `undefined` when the role may not read them.
 */
export const cronJobs = async (sql: Sql) => {
  const [row] = await sql<{ exists: boolean }[]>`select to_regclass('cron.job') is not null as exists`
  if (!row!.exists) return []
  if (!(await readable(sql, 'cron.job'))) return undefined
  const jobs = await sql<CronJob[]>`
    select jobid::int as id, jobname as name, schedule, command, active, database, database = current_database() as local from cron.job order by jobid
  `
  return [...jobs]
}

/** The time zone pg_cron reads its schedules in, its `cron.timezone` setting: GMT unless the project set another. */
export const cronTimezone = async (sql: Sql) => {
  const [row] = await sql<{ timezone: string | null }[]>`select current_setting('cron.timezone', true) as timezone`
  return row!.timezone ?? 'GMT'
}

/** Vault's secrets by name, for the report. */
export const vaultSecrets = async (sql: Sql) => {
  const [row] = await sql<{ exists: boolean }[]>`select to_regclass('vault.secrets') is not null as exists`
  if (!row!.exists) return []
  if (!(await readable(sql, 'vault.secrets'))) return undefined
  return sql<{ name: string | null; description: string }[]>`select name, description from vault.secrets order by name`
}

export type VaultSecret = { name: string | null; description: string; secret: string | null }

/**
 * Vault's secrets with their values, decrypted, for the replay: the ciphertext opens only with Supabase's key.
 * `undefined` when the role may not read them.
 */
export const vaultSecretValues = async (sql: Sql) => {
  if (!(await readable(sql, 'vault.decrypted_secrets'))) return undefined
  return sql<VaultSecret[]>`select name, description, decrypted_secret as secret from vault.decrypted_secrets order by created_at, id`
}

export type EncryptedColumn = { schema: string; table: string; column: string }

/**
 * The columns of `schemas` pgsodium's Transparent Column Encryption encrypts, by a security label: their ciphertext
 * opens only with the Supabase project's root key, so the dump copies it as it is.
 */
export const pgsodiumColumns = (sql: Sql, schemas: string[]) => sql<EncryptedColumn[]>`
  select n.nspname as schema, c.relname as table, a.attname as column
  from pg_seclabel l
  join pg_class c on c.oid = l.objoid join pg_namespace n on n.oid = c.relnamespace
  join pg_attribute a on a.attrelid = c.oid and a.attnum = l.objsubid
  where l.provider = 'pgsodium' and l.classoid = 'pg_class'::regclass and l.objsubid > 0 and n.nspname = any(${schemas})
  order by 1, 2, 3
`

export type QueueMessage = { message: string | null; headers: string | null; visibleAt: string }

export type Queue = { name: string; unlogged: boolean; partitioned: boolean; messages: QueueMessage[] }

/**
 * pgmq's queues with their messages, in order. The extension owns the queues' tables, so pg_dump leaves them out.
 * `undefined` when the role may not read them.
 */
export const pgmqQueues = async (sql: Sql) => {
  const [row] = await sql<{ exists: boolean }[]>`select to_regclass('pgmq.meta') is not null as exists`
  if (!row!.exists) return []
  if (!(await readable(sql, 'pgmq.meta'))) return undefined
  const meta = await sql<{ name: string; unlogged: boolean; partitioned: boolean }[]>`
    select queue_name as name, is_unlogged as unlogged, is_partitioned as partitioned from pgmq.meta order by created_at, queue_name
  `
  const queues: Queue[] = []
  for (const queue of meta) {
    // Headers came with pgmq 1.5, so an older queue has none; a missing column or SQL NULL is no headers.
    const messages = await sql<QueueMessage[]>`
      select q.message::text as message, nullif(to_jsonb(q) -> 'headers', 'null')::text as headers, q.vt::text as "visibleAt"
      from pgmq.${sql(`q_${queue.name}`)} q order by q.msg_id
    `
    queues.push({ ...queue, messages: [...messages] })
  }
  return queues
}

/** timescaledb's hypertables in `schemas`, with their rows, which live in chunks the dump leaves out. */
export const hypertables = async (sql: Sql, schemas: string[]) => {
  const [row] = await sql<{ exists: boolean }[]>`select to_regclass('timescaledb_information.hypertables') is not null as exists`
  if (!row!.exists) return []
  const tables = await sql<{ schema: string; table: string }[]>`
    select hypertable_schema as schema, hypertable_name as table from timescaledb_information.hypertables
    where hypertable_schema = any(${schemas}) order by 1, 2
  `
  const counted: DumpedTable[] = []
  for (const table of tables) {
    const [count] = await sql<{ rows: string }[]>`select count(*) as rows from ${sql(table.schema)}.${sql(table.table)}`
    counted.push({ ...table, rows: Number(count!.rows) })
  }
  return counted
}

/** The functions and procedures of `schemas` written in `languages`, as `schema.name`. */
export const routinesIn = async (sql: Sql, schemas: string[], languages: string[]) => {
  const rows = await sql<{ name: string; language: string }[]>`
    select n.nspname || '.' || p.proname as name, l.lanname as language
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace join pg_language l on l.oid = p.prolang
    where n.nspname = any(${schemas}) and l.lanname = any(${languages})
    order by 1
  `
  return [...rows]
}

export const realtimeTables = (sql: Sql) => sql<{ schema: string; table: string }[]>`
  select schemaname as schema, tablename as table from pg_publication_tables where pubname = 'supabase_realtime' order by 1, 2
`

export type HttpTrigger = { schema: string; table: string; trigger: string; function: string }

// A parameter, since a template literal would read the backslashes itself.
const httpCall = String.raw`\mnet\.http_(get|post|delete)\M`

/** Triggers of `schemas` that call out over HTTP: database webhooks, and functions calling pg_net's `net.http_*`. */
export const httpTriggers = (sql: Sql, schemas: string[]) => sql<HttpTrigger[]>`
  select tn.nspname as schema, c.relname as table, t.tgname as trigger, pn.nspname || '.' || p.proname as function
  from pg_trigger t
  join pg_class c on c.oid = t.tgrelid join pg_namespace tn on tn.oid = c.relnamespace
  join pg_proc p on p.oid = t.tgfoid join pg_namespace pn on pn.oid = p.pronamespace
  where not t.tgisinternal and tn.nspname = any(${schemas})
    and (pn.nspname = 'supabase_functions' or p.prosrc ~ ${httpCall})
  order by 1, 2, 3
`
