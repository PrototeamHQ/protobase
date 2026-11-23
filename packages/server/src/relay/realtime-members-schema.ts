import { sql } from 'kysely'
import type { Db } from '@protobase/query'
import { argsOf, membersComment, membersSql, realtimeMembersTable, realtimeSchema, rowTrigger, truncateTrigger, type ListedTable } from './realtime-members-sql'

// The trigger args as Postgres keeps them, each ended by a zero byte, in hex.
const storedArgs = (args: readonly string[]) => Buffer.from(args.map((arg) => `${arg}\0`).join(''), 'utf8').toString('hex')

/**
 * Refuses channel tables that are partitions, or that inherit or are inherited from other than by partitioning: their
 * rows are written through a table the triggers do not stand on. A partitioned channel table is kept (see `membersSql`).
 */
export const refuseInherited = (tables: readonly string[]) => {
  if (tables.length === 0) return
  throw new Error(`realtime.members cannot keep the members of ${tables.join(', ')}: a partition or a table in an inheritance tree is not supported as a channel resource whose records list their members; use the partitioned table itself`)
}

/**
 * The listed tables as the database has them: each one and its partitions as SQL names them, and whether
 * it is refused (`refuseInherited`); and whether the members table exists.
 */
const listedTables = async (db: Db, listed: readonly ListedTable[]) => {
  const { rows } = await sql<{ name: string; rel: string | null; members: boolean; inherited: boolean; partitions: string[] }>`select name,
      to_regclass(name)::text as rel, to_regclass(${realtimeMembersTable}) is not null as members,
      exists (select from pg_class c where c.oid = to_regclass(name) and (c.relispartition or (c.relkind <> 'p' and exists (select from pg_inherits i where i.inhrelid = c.oid or i.inhparent = c.oid)))) as inherited,
      array(select tree.relid::regclass::text from pg_partition_tree(to_regclass(name)) as tree where tree.relid <> to_regclass(name) order by tree.relid::regclass::text) as partitions
    from unnest(${listed.map(({ table }) => table)}::text[]) with ordinality as listed(name, place) order by place`.execute(db)
  refuseInherited(rows.filter((row) => row.inherited).map((row) => row.name))
  return rows
}

/**
 * Whether the triggers of this version stand on exactly the listed tables with their args, a truncate trigger on each
 * of their partitions too, each firing on every write (enabled, not only for replicas), as must the clones of the row
 * trigger Postgres keeps on the partitions, and the members table exists; the tables, as SQL names them, with any of
 * them but clones; and the partitions of each listed table. A partition attached later lacks its truncate trigger, so
 * startup asks for the migration that writes them all again.
 */
const standingTriggers = async (db: Db, listed: readonly ListedTable[]) => {
  const tables = await listedTables(db, listed)
  const { rows } = await sql<{ name: string; args: string; current: boolean; enabled: boolean; clone: boolean; table: string }>`select t.tgname as name,
      encode(t.tgargs, 'hex') as args, coalesce(obj_description(p.oid, 'pg_proc') = ${membersComment}, false) as current, t.tgenabled in ('O', 'A') as enabled,
      t.tgparentid <> 0 as clone, t.tgrelid::regclass::text as "table"
    from pg_trigger t join pg_proc p on p.oid = t.tgfoid join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = ${realtimeSchema} and p.proname = 'members_kept'`.execute(db)
  // A clone counts only by firing: it stands where Postgres puts it, and goes with the trigger it was cloned from.
  const roots = rows.filter((row) => !row.clone)
  const expected = listed.flatMap((table, i) => {
    const { rel, partitions } = tables[i]!
    const args = storedArgs(argsOf(table))
    return [`${rel}|${rowTrigger}|${args}`, ...[rel, ...partitions].map((on) => `${on}|${truncateTrigger}|${args}`)]
  })
  const found = roots.map((row) => `${row.table}|${row.name}|${row.args}`)
  const exact = expected.length === found.length && expected.every((entry) => found.includes(entry)) && rows.every((row) => row.current && row.enabled)
  const membersTable = listed.length === 0 || tables.every((row) => row.members && row.rel !== null)
  return { current: exact && membersTable, standing: [...new Set(roots.map((row) => row.table))], partitions: tables.map((row) => row.partitions) }
}

/** The SQL that keeps `realtime.members` for the listed tables (`membersSql`); `undefined` when it is current. */
export const realtimeMembersMigration = async (db: Db, listed: readonly ListedTable[]) => {
  const { current, standing, partitions } = await standingTriggers(db, listed)
  if (current) return
  return `${membersSql(listed, standing, partitions).join(';\n\n')};`
}

/** Refuses to start while `realtime.members` would not follow the listed tables' members. */
export const checkRealtimeMembers = async (db: Db, listed: readonly ListedTable[], command: string) => {
  if ((await standingTriggers(db, listed)).current) return
  throw new Error(`The realtime.members table, or the triggers that keep it on ${listed.map(({ table }) => table).join(', ')} and their partitions, is missing or out of date. Write it as a migration with \`${command}\`, apply it with the project's migrations, then start again.`)
}
