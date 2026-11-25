import { sql } from 'kysely'
import type { Db } from '@protobase/query'
import { regclassText } from './grants-sql'
import { queryRunnerSignature } from './runner-sql'

/** A table as config names it: the search path decides when it names no schema. */
export type TableName = { schema?: string; name: string }

/** The tables the role must never read: these, and every table in `schemas`, whatever its name. */
export type GuardedTables = { tables: readonly TableName[]; schemas: readonly string[] }

const rowsOf = async <R>(db: Db, query: ReturnType<typeof sql<R>>) => (await query.execute(db)).rows

// The guarded tables as `pg_class` rows: those listed that exist, and every relation of a guarded schema.
const guardedRelations = ({ tables, schemas }: GuardedTables) =>
  sql`select c.oid, c.relnamespace from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where c.oid in (select to_regclass(t.name) from unnest(${tables.map(regclassText)}::text[]) as t(name)) or n.nspname = any(${[...schemas]}::text[])`

// What a migration does not take back: a grant or an owner changed by hand.
const refusal = (state: string) => new Error(`The query role of the assistant's read-only queries ${state}. Take back by hand what it was given, then start again.`)

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
 * Refuses to go on while the runner of the assistant's read-only queries, which the record of migrations says is there,
 * does not run as a role weaker than the app's: it is no security definer, or runs as the app's role itself or one it
 * is a member of, a superuser, a login role, or one that can read an auth table, or while that role may call a
 * security-definer function that runs as a role able to read one. A migration cannot promise these: they are the live
 * database's, such as a grant made by hand. It checks the owner's privileges, not its name, so a database cloned under
 * another name still passes. A resource added since the last migration is not checked: Postgres refuses to read its
 * table until then.
 */
export const checkQueryRoleSafety = async (db: Db, authTables: GuardedTables) => {
  const [runner] = await rowsOf(
    db,
    sql<{ definer: boolean; strong: boolean; reads_auth: boolean }>`select p.prosecdef as definer,
      (o.rolsuper or o.rolcanlogin or pg_has_role(p.proowner, current_user, 'MEMBER')) as strong,
      exists (select from (${guardedRelations(authTables)}) c
        where has_schema_privilege(p.proowner, c.relnamespace, 'USAGE') and has_any_column_privilege(p.proowner, c.oid, 'SELECT')) as reads_auth
      from pg_proc p join pg_roles o on o.oid = p.proowner where p.oid = to_regprocedure(${queryRunnerSignature})`,
  )
  // Without the runner no query runs: the record of migrations names what it lacks.
  if (!runner) return
  if (!runner.definer) throw refusal(`is not what ${queryRunnerSignature} runs as: it is no security definer`)
  if (runner.strong) throw refusal('is not weaker than the app\'s database role')
  if (runner.reads_auth) throw refusal('can read the auth schema')
  const leaking = await leakingFunctions(db, authTables)
  if (leaking.length === 0) return
  throw new Error(
    `The query role of the assistant's read-only queries can read the auth schema through the security-definer functions ${leaking.map((found) => found.name).join(', ')}. Revoke execute on them from PUBLIC, or move them to a schema without a resource, then start again.`,
  )
}
