import { sql } from 'kysely'
import type { Db } from '@protobase/query'
import type { ResourceModel } from '@protobase/schema'
import { migrationCommand } from '../../jobs/schema'
import { modelVariables } from '../model-settings'
import { plannedGrants, type FoundTable } from './runner-plan'
import { queryRoleSql, queryRunnerSignature, queryRunnerSql, runnerBody } from './runner-sql'

/** A table as config names it: the search path decides when it names no schema. */
export type TableName = { schema?: string; name: string }

/** The tables the role must never read: these, and every table in `schemas`, whatever its name. */
export type GuardedTables = { tables: readonly TableName[]; schemas: readonly string[] }

const quoted = (name: string) => `"${name.replaceAll('"', '""')}"`

const regclassText = ({ schema, name }: TableName) => (schema ? `${quoted(schema)}.${quoted(name)}` : quoted(name))

const roleSql = sql.raw(queryRoleSql)

const rowsOf = async <R>(db: Db, query: ReturnType<typeof sql<R>>) => (await query.execute(db)).rows

// The guarded tables as `pg_class` rows: those listed that exist, and every relation of a guarded schema.
const guardedRelations = ({ tables, schemas }: GuardedTables) =>
  sql`select c.oid, c.relnamespace from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where c.oid in (select to_regclass(t.name) from unnest(${tables.map(regclassText)}::text[]) as t(name)) or n.nspname = any(${[...schemas]}::text[])`

// The tables that exist, as the catalogue names them, in the order given; a table that does not is left out.
const resolved = (db: Db, tables: readonly TableName[]) =>
  rowsOf(
    db,
    sql<FoundTable>`select n.nspname as schema, c.relname as name from unnest(${tables.map(regclassText)}::text[]) with ordinality as t(name, n)
      join pg_class c on c.oid = to_regclass(t.name) join pg_namespace n on n.oid = c.relnamespace order by t.n`,
  )

const readRunner = async (db: Db) => {
  const [runner] = await rowsOf(
    db,
    sql<{ source: string; definer: boolean; owner: string; executable: boolean }>`select p.prosrc as source, p.prosecdef as definer, pg_get_userbyid(p.proowner) as owner,
      (p.proacl is null or exists (select from aclexplode(p.proacl) a where a.grantee = 0 and a.privilege_type = 'EXECUTE')) as executable
      from pg_proc p where p.oid = to_regprocedure(${queryRunnerSignature})`,
  )
  return runner
}

/** What the database holds of the query role and its runner, and the tables the role should read and must not. Only reads the catalogue. */
export const readQueryRunner = async (db: Db, models: readonly ResourceModel[], authTables: GuardedTables) => {
  const [role] = await rowsOf(db, sql<{ name: string; exists: boolean }>`select ${roleSql} as name, exists (select from pg_roles where rolname = ${roleSql}) as exists`)
  const tables = await rowsOf(
    db,
    sql<FoundTable>`select n.nspname as schema, c.relname as name from pg_class c join pg_namespace n on n.oid = c.relnamespace, aclexplode(c.relacl) a
      where a.grantee = (select oid from pg_roles where rolname = ${roleSql}) and a.privilege_type = 'SELECT' order by 1, 2`,
  )
  const schemas = await rowsOf(
    db,
    sql<{ schema: string }>`select n.nspname as schema from pg_namespace n, aclexplode(n.nspacl) a
      where a.grantee = (select oid from pg_roles where rolname = ${roleSql}) and a.privilege_type = 'USAGE' order by 1`,
  )
  return {
    role: role!,
    runner: await readRunner(db),
    resources: await resolved(db, models.map((model) => model.table)),
    authTables: await resolved(db, authTables.tables),
    guardedSchemas: [...authTables.schemas],
    granted: { tables, schemas: schemas.map((found) => found.schema) },
  }
}

/**
 * The SQL that makes the role the assistant's read-only queries run as, and its runner, and grants it exactly the
 * resources' tables, never an auth table; `undefined` when the database is current.
 */
export const queryRunnerMigration = async (db: Db, models: readonly ResourceModel[], authTables: GuardedTables) => {
  const { role, runner, resources, authTables: auth, guardedSchemas, granted } = await readQueryRunner(db, models, authTables)
  const plan = plannedGrants({ resources, authTables: auth, guardedSchemas, granted })
  const current =
    role.exists && runner?.source === runnerBody && runner.definer && runner.owner === role.name && !runner.executable && plan.grants.length === 0 && plan.revokes.length === 0
  return current ? undefined : queryRunnerSql(plan)
}

// `protobase migration` writes the role only when it finds the built-in assistant's key, as startup does.
const refusal = (state: string) =>
  new Error(
    `The query role of the assistant's read-only queries ${state}. Write it as a migration with \`${migrationCommand}\`, run with the built-in assistant's key set (${modelVariables.apiKey} or options.assistant.apiKey), apply it with the project's migrations, then start again.`,
  )

// Security-definer functions the query role may call that run as a role able to read an auth table: the statement
// would read the auth store through them. Trigger functions cannot be called.
const leakingFunctions = (db: Db, authTables: GuardedTables) =>
  rowsOf(
    db,
    sql<{ name: string }>`with runner as (select proowner as role from pg_proc where oid = to_regprocedure(${queryRunnerSignature}))
      select format('%I.%I(%s)', n.nspname, p.proname, pg_get_function_identity_arguments(p.oid)) as name
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace, runner
      where p.prosecdef and p.prorettype <> 'trigger'::regtype and p.proowner <> runner.role
        and has_schema_privilege(runner.role, p.pronamespace, 'USAGE') and has_function_privilege(runner.role, p.oid, 'EXECUTE')
        and exists (select from (${guardedRelations(authTables)}) c
          where has_schema_privilege(p.proowner, c.relnamespace, 'USAGE') and has_any_column_privilege(p.proowner, c.oid, 'SELECT'))
      order by 1`,
  )

/**
 * Refuses to go on while the runner of the assistant's read-only queries is missing or out of date, or runs as a role
 * that is not weaker than the app's: the app's role itself or one it is a member of, a superuser, a login role, or one
 * that can read an auth table, or while the role may call a security-definer function that runs as a role able to
 * read one. It checks the owner's privileges, not its name, so a database cloned under another name still passes. A resource added since the last migration is not checked: Postgres refuses to read its table until then.
 */
export const checkQueryRunner = async (db: Db, authTables: GuardedTables) => {
  const [runner] = await rowsOf(
    db,
    sql<{ source: string; definer: boolean; strong: boolean; reads_auth: boolean }>`select p.prosrc as source, p.prosecdef as definer,
      (o.rolsuper or o.rolcanlogin or pg_has_role(p.proowner, current_user, 'MEMBER')) as strong,
      exists (select from (${guardedRelations(authTables)}) c
        where has_schema_privilege(p.proowner, c.relnamespace, 'USAGE') and has_any_column_privilege(p.proowner, c.oid, 'SELECT')) as reads_auth
      from pg_proc p join pg_roles o on o.oid = p.proowner where p.oid = to_regprocedure(${queryRunnerSignature})`,
  )
  if (!runner || !runner.definer || runner.source !== runnerBody) throw refusal('is missing')
  if (runner.strong) throw refusal('is not weaker than the app\'s database role')
  if (runner.reads_auth) throw refusal('can read the auth schema')
  const leaking = await leakingFunctions(db, authTables)
  if (leaking.length === 0) return
  throw new Error(
    `The query role of the assistant's read-only queries can read the auth schema through the security-definer functions ${leaking.map((found) => found.name).join(', ')}. Revoke execute on them from PUBLIC, or move them to a schema without a resource, then start again.`,
  )
}
