import { sql } from 'kysely'
import type { Db } from '@protobase/query'
import type { ResourceModel } from '@protobase/schema'
import { migrationCommand } from '../../jobs/schema'
import { plannedGrants, type FoundTable } from './runner-plan'
import { queryRoleSql, queryRunnerSignature, queryRunnerSql, runnerBody } from './runner-sql'

/** A table as config names it: the search path decides when it names no schema. */
export type TableName = { schema?: string; name: string }

const quoted = (name: string) => `"${name.replaceAll('"', '""')}"`

const regclassText = ({ schema, name }: TableName) => (schema ? `${quoted(schema)}.${quoted(name)}` : quoted(name))

const roleSql = sql.raw(queryRoleSql)

const rowsOf = async <R>(db: Db, query: ReturnType<typeof sql<R>>) => (await query.execute(db)).rows

// The tables that exist, as the catalogue names them; a table that does not is left out.
const resolved = (db: Db, tables: readonly TableName[]) =>
  rowsOf(
    db,
    sql<FoundTable>`select n.nspname as schema, c.relname as name from unnest(${tables.map(regclassText)}::text[]) as t(name)
      join pg_class c on c.oid = to_regclass(t.name) join pg_namespace n on n.oid = c.relnamespace`,
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
export const readQueryRunner = async (db: Db, models: readonly ResourceModel[], authTables: readonly TableName[]) => {
  const [role] = await rowsOf(db, sql<{ name: string; exists: boolean }>`select ${roleSql} as name, exists (select from pg_roles where rolname = ${roleSql}) as exists`)
  const tables = await rowsOf(
    db,
    sql<FoundTable>`select n.nspname as schema, c.relname as name from pg_class c join pg_namespace n on n.oid = c.relnamespace, aclexplode(c.relacl) a
      where a.grantee = (select oid from pg_roles where rolname = ${roleSql}) and a.privilege_type = 'SELECT'`,
  )
  const schemas = await rowsOf(
    db,
    sql<{ schema: string }>`select n.nspname as schema from pg_namespace n, aclexplode(n.nspacl) a
      where a.grantee = (select oid from pg_roles where rolname = ${roleSql}) and a.privilege_type = 'USAGE'`,
  )
  return {
    role: role!,
    runner: await readRunner(db),
    resources: await resolved(db, models.map((model) => model.table)),
    authTables: await resolved(db, authTables),
    granted: { tables, schemas: schemas.map((found) => found.schema) },
  }
}

/**
 * The SQL that makes the role the assistant's read-only queries run as, and its runner, and grants it exactly the
 * resources' tables, never an auth table; `undefined` when the database is current.
 */
export const queryRunnerMigration = async (db: Db, models: readonly ResourceModel[], authTables: readonly TableName[]) => {
  const { role, runner, resources, authTables: auth, granted } = await readQueryRunner(db, models, authTables)
  const plan = plannedGrants({ resources, authTables: auth, granted })
  const current =
    role.exists && runner?.source === runnerBody && runner.definer && runner.owner === role.name && !runner.executable && plan.grants.length === 0 && plan.revokes.length === 0
  return current ? undefined : queryRunnerSql(plan)
}

const refusal = (state: string) =>
  new Error(`The query role of the assistant's read-only queries ${state}. Write it as a migration with \`${migrationCommand}\`, apply it with the project's migrations, then start again.`)

/**
 * Refuses to go on while the runner of the assistant's read-only queries is missing or out of date, or runs as a role
 * that is not weaker than the app's: the app's role itself or one it is a member of, a superuser, a login role, or one
 * that can read an auth table. It checks the owner's privileges, not its name, so a database cloned under another name
 * still passes. A resource added since the last migration is not checked: Postgres refuses to read its table until then.
 */
export const checkQueryRunner = async (db: Db, authTables: readonly TableName[]) => {
  const [runner] = await rowsOf(
    db,
    sql<{ source: string; definer: boolean; strong: boolean; reads_auth: boolean }>`select p.prosrc as source, p.prosecdef as definer,
      (o.rolsuper or o.rolcanlogin or pg_has_role(p.proowner, current_user, 'MEMBER')) as strong,
      exists (select from unnest(${authTables.map(regclassText)}::text[]) as t(name) join pg_class c on c.oid = to_regclass(t.name)
        where has_schema_privilege(p.proowner, c.relnamespace, 'USAGE') and has_any_column_privilege(p.proowner, c.oid, 'SELECT')) as reads_auth
      from pg_proc p join pg_roles o on o.oid = p.proowner where p.oid = to_regprocedure(${queryRunnerSignature})`,
  )
  if (!runner || !runner.definer || runner.source !== runnerBody) throw refusal('is missing')
  if (runner.strong) throw refusal('is not weaker than the app\'s database role')
  if (runner.reads_auth) throw refusal('can read the auth schema')
}
