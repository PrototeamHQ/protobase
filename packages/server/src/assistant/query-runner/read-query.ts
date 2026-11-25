import { sql } from 'kysely'
import type { Db } from '@protobase/query'
import { resourceEntry } from '../../schema-modules/resource-difference'
import type { ModuleInput, ModuleModel, ResourceEntry, ResourceReplaceable } from '../../schema-modules/schema-module'
import { regclassText } from './grants-sql'
import { queryRoleSql, queryRunnerSchema, queryRunnerSignature, runnerBody } from './runner-sql'

type FoundTable = { schema: string; name: string }

const roleSql = sql.raw(queryRoleSql)
const rowsOf = async <R>(db: Db, query: ReturnType<typeof sql<R>>) => (await query.execute(db)).rows
const same = (a: FoundTable, b: FoundTable) => a.schema === b.schema && a.name === b.name

/**
 * The query module as the database has it for `input`: step 1 once the role and the runner's schema are there, the
 * runner at version 1 when it is this version's, run as the role and not executable by PUBLIC, each resource whose
 * table the role reads, at no digest when it lacks usage on the table's schema, so its grants are written again; and
 * each table the role reads that no resource has, by its name, so they are taken back. Nothing without the role.
 */
export const readQuery = (grants: ResourceReplaceable) => async (db: Db, input: ModuleInput): Promise<ModuleModel | undefined> => {
  const [role] = await rowsOf(
    db,
    sql<{ name: string; exists: boolean; schema: boolean }>`select ${roleSql} as name, exists (select from pg_roles where rolname = ${roleSql}) as exists, to_regnamespace(${queryRunnerSchema}) is not null as schema`,
  )
  if (!role!.exists) return
  const [runner] = await rowsOf(
    db,
    sql<{ source: string; definer: boolean; owner: string; executable: boolean }>`select p.prosrc as source, p.prosecdef as definer, pg_get_userbyid(p.proowner) as owner,
      (p.proacl is null or exists (select from aclexplode(p.proacl) a where a.grantee = 0 and a.privilege_type = 'EXECUTE')) as executable
      from pg_proc p where p.oid = to_regprocedure(${queryRunnerSignature})`,
  )
  const granted = await rowsOf(
    db,
    sql<FoundTable>`select n.nspname as schema, c.relname as name from pg_class c join pg_namespace n on n.oid = c.relnamespace, aclexplode(c.relacl) a
      where a.grantee = (select oid from pg_roles where rolname = ${roleSql}) and a.privilege_type = 'SELECT' order by 1, 2`,
  )
  const usage = (
    await rowsOf(
      db,
      sql<{ schema: string }>`select n.nspname as schema from pg_namespace n, aclexplode(n.nspacl) a
        where a.grantee = (select oid from pg_roles where rolname = ${roleSql}) and a.privilege_type = 'USAGE'`,
    )
  ).map((found) => found.schema)
  const given = Object.entries(input.resources[grants.name] ?? {})
  // Each resource's table as the catalogue resolves it, in the order given; null for one that does not exist.
  const resolved = await rowsOf(
    db,
    sql<{ schema: string | null; name: string | null }>`select n.nspname as schema, c.relname as name from unnest(${given.map(([, one]) => regclassText(one.table))}::text[]) with ordinality as t(name, place)
      left join pg_class c on c.oid = to_regclass(t.name) left join pg_namespace n on n.oid = c.relnamespace order by t.place`,
  )
  const entries: Record<string, ResourceEntry> = {}
  given.forEach(([key, one], i) => {
    const table = resolved[i]!
    if (table.schema === null || table.name === null || !granted.some((found) => same(found, table as FoundTable))) return
    const entry = resourceEntry(grants, input.names, one)
    entries[key] = usage.includes(table.schema) ? entry : { ...entry, digest: '' }
  })
  for (const found of granted) {
    if (resolved.some((table) => table.schema !== null && same(found, table as FoundTable))) continue
    entries[`${found.schema}.${found.name}`] = { version: grants.version, digest: '', table: found }
  }
  const current = runner?.source === runnerBody && runner.definer && runner.owner === role!.name && !runner.executable
  return {
    lastStep: role!.schema ? 1 : 0,
    replaceables: current ? { runner: 1 } : {},
    ...(Object.keys(entries).length > 0 && { resources: { [grants.name]: entries } }),
  }
}
