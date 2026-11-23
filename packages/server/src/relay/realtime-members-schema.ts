import { sql } from 'kysely'
import type { Db } from '@protobase/query'
import { argsOf, membersComment, membersSql, realtimeMembersTable, realtimeSchema, rowTrigger, truncateTrigger, type ListedTable } from './realtime-members-sql'

// The trigger args as Postgres keeps them, each ended by a zero byte, in hex.
const storedArgs = (args: readonly string[]) => Buffer.from(args.map((arg) => `${arg}\0`).join(''), 'utf8').toString('hex')

/**
 * Whether the triggers of this version stand on exactly the listed tables with their args, each firing on every write
 * (enabled, not only for replicas), and the members table exists; and the tables, as SQL names them, that have any of
 * them. A partition's clones of a trigger are its parent's, so only triggers of no parent count.
 */
const standingTriggers = async (db: Db, listed: readonly ListedTable[]) => {
  const { rows } = await sql<{ rel: string; name: string; args: string; current: boolean; enabled: boolean; table: string }>`select t.tgrelid::text as rel, t.tgname as name, encode(t.tgargs, 'hex') as args,
      coalesce(obj_description(p.oid, 'pg_proc') = ${membersComment}, false) as current, t.tgenabled in ('O', 'A') as enabled, t.tgrelid::regclass::text as "table"
    from pg_trigger t join pg_proc p on p.oid = t.tgfoid join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = ${realtimeSchema} and p.proname = 'members_kept' and t.tgparentid = 0`.execute(db)
  const tables = await sql<{ rel: string | null; members: boolean }>`select to_regclass(name)::oid::text as rel, to_regclass(${realtimeMembersTable}) is not null as members
    from unnest(${listed.map(({ table }) => table)}::text[]) with ordinality as listed(name, place) order by place`.execute(db)
  const expected = listed.flatMap((table, i) => {
    const rel = tables.rows[i]?.rel
    return [`${rel}|${rowTrigger}|${storedArgs(argsOf(table))}`, `${rel}|${truncateTrigger}|${storedArgs([table.resource])}`]
  })
  const found = rows.map((row) => `${row.rel}|${row.name}|${row.args}`)
  const exact = expected.length === found.length && expected.every((entry) => found.includes(entry)) && rows.every((row) => row.current && row.enabled)
  const membersTable = listed.length === 0 || tables.rows.every((row) => row.members && row.rel !== null)
  return { current: exact && membersTable, standing: [...new Set(rows.map((row) => row.table))] }
}

/** The SQL that keeps `realtime.members` for the listed tables (`membersSql`); `undefined` when it is current. */
export const realtimeMembersMigration = async (db: Db, listed: readonly ListedTable[]) => {
  const { current, standing } = await standingTriggers(db, listed)
  if (current) return
  return `${membersSql(listed, standing).join(';\n\n')};`
}

/** Refuses to start while `realtime.members` would not follow the listed tables' members. */
export const checkRealtimeMembers = async (db: Db, listed: readonly ListedTable[], command: string) => {
  if ((await standingTriggers(db, listed)).current) return
  throw new Error(`The realtime.members table, or the triggers that keep it on ${listed.map(({ table }) => table).join(', ')}, is missing or out of date. Write it as a migration with \`${command}\`, apply it with the project's migrations, then start again.`)
}
