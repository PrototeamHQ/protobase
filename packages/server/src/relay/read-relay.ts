import { sql } from 'kysely'
import type { Db } from '@protobase/query'
import { resourceEntry } from '../schema-modules/resource-difference'
import type { ModuleInput, ModuleModel, ResourceEntry, ResourceReplaceable } from '../schema-modules/schema-module'
import { memberFunctionComment, memberTriggersFound, type MemberTable } from './organization-members-sql'
import { argsOf, membersVersion, realtimeMembersTable, realtimeSchema, rowTrigger, truncateTrigger, type ListedTable } from './realtime-members-sql'
import { sessionsCurrent, sessionsVersion } from './sessions-sql'

// A trigger's arguments are kept as bytes, each ended by a zero byte.
const triggerArgs = (hex: string) => new TextDecoder().decode(Buffer.from(hex, 'hex')).split('\0').slice(0, -1)

type FoundTrigger = { table: string; schema: string; relname: string; name: string; args: string[]; enabled: boolean; partitions: string[] }

// Every trigger calling `members_kept()` but Postgres's clones on partitions, with the table it is on as SQL names it
// and that table's partitions, in one read; a clone counts by firing, so a disabled one at any depth of the partition
// tree, a clone of a clone included, marks its root disabled.
const readTriggers = async (db: Db): Promise<FoundTrigger[]> =>
  (
    await sql<{ table: string; schema: string; relname: string; name: string; args: string; enabled: boolean; partitions: string[] }>`select t.tgrelid::regclass::text as "table",
        n.nspname as schema, c.relname, t.tgname as name,
        encode(t.tgargs, 'hex') as args,
        t.tgenabled in ('O', 'A') and not exists (
          with recursive clones as (select oid, tgenabled from pg_trigger where tgparentid = t.oid
            union all select c.oid, c.tgenabled from pg_trigger c join clones on c.tgparentid = clones.oid)
          select from clones where tgenabled not in ('O', 'A')
        ) as enabled,
        array(select tree.relid::regclass::text from pg_partition_tree(t.tgrelid) as tree where tree.relid <> t.tgrelid order by 1) as partitions
      from pg_trigger t join pg_proc p on p.oid = t.tgfoid join pg_namespace pn on pn.oid = p.pronamespace
      join pg_class c on c.oid = t.tgrelid join pg_namespace n on n.oid = c.relnamespace
      where pn.nspname = ${realtimeSchema} and p.proname = 'members_kept' and t.tgparentid = 0`.execute(db)
  ).rows.map((row) => ({ ...row, args: triggerArgs(row.args) }))

// The table as SQL names it, as the catalogue gives it back: unquoted where Postgres needs no quotes.
const regclassText = async (db: Db, tables: readonly string[]) =>
  (await sql<{ text: string | null }>`select to_regclass(name)::text as text from unnest(${tables}::text[]) with ordinality as listed(name, place) order by place`.execute(db)).rows.map((row) => row.text)

/**
 * Whether `found` keeps `listed` on its table `rel`: the row trigger and a truncate trigger on it and on each of its
 * partitions, with its arguments, every one firing.
 */
const keeps = (found: readonly FoundTrigger[], listed: ListedTable, rel: string) => {
  const args = argsOf(listed).join('\0')
  const own = found.filter((trigger) => trigger.args.join('\0') === args && (trigger.table === rel || found.some((root) => root.table === rel && root.partitions.includes(trigger.table))))
  const row = own.find((trigger) => trigger.table === rel && trigger.name === rowTrigger)
  if (!row) return false
  const truncates = [rel, ...row.partitions].every((table) => own.some((trigger) => trigger.table === table && trigger.name === truncateTrigger))
  return truncates && own.every((trigger) => trigger.enabled)
}

/**
 * The organization trigger as the database has it for `input`: at the entry it writes when it stands on the member
 * table `input` names with all three triggers, calling the function this version writes for the columns `input` names,
 * at no digest when it is older or reads other columns, so it is written again,
 * and at no digest under the table it is on when that is another table, so it is dropped.
 */
const readOrganization = async (db: Db, organization: ResourceReplaceable, input: ModuleInput) => {
  const found = await memberTriggersFound(db)
  const given = input.resources[organization.name]?.member
  const [rel] = given ? await regclassText(db, [(given.input as MemberTable).table]) : []
  const entries: Record<string, ResourceEntry> = {}
  for (const trigger of found) {
    if (given && trigger.table === rel) {
      const entry = resourceEntry(organization, input.names, given)
      const current = trigger.complete && trigger.comment === memberFunctionComment(given.input as MemberTable)
      entries.member = current ? entry : { ...entry, digest: '' }
      continue
    }
    entries[given ? `member on ${trigger.table}` : 'member'] = { version: organization.version, digest: '', table: { schema: trigger.schema, name: trigger.name } }
  }
  return entries
}

/**
 * The relay's objects as the database has them for `input`: step 1 once `realtime.members` is there, the sessions
 * trigger at its version when it stands on the sessions table with this version's function, the members functions at
 * the version their comment names, and each listed resource whose table has the triggers this version writes, else at
 * no digest, so they are written again; and the row triggers on tables no listed resource has, by the resource their
 * first argument names, so they are dropped; and the organization trigger (`readOrganization`). Refuses members
 * functions of a version no step records.
 */
export const readRelay = (members: ResourceReplaceable, organization: ResourceReplaceable) => async (db: Db, input: ModuleInput): Promise<ModuleModel | undefined> => {
  const [state] = (
    await sql<{ table: boolean; comment: string | null }>`select to_regclass(${realtimeMembersTable}) is not null as table,
      (select obj_description(p.oid, 'pg_proc') from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = ${realtimeSchema} and p.proname = 'members_kept' and p.pronargs = 0) as comment`.execute(db)
  ).rows
  const sessions = await sessionsCurrent(db, input.names.sessions!)
  if (!state!.table && !sessions) return
  const version = state!.comment?.match(/^Protobase realtime members (\d+)$/)?.[1]
  if (state!.comment && Number(version) !== membersVersion) {
    throw new Error(`The functions that keep realtime.members are at ${version === undefined ? 'a version' : `version ${version}`} no step of this version of Protobase records`)
  }
  const found = await readTriggers(db)
  const given = Object.entries(input.resources[members.name] ?? {})
  const rels = await regclassText(db, given.map(([, { input: listed }]) => (listed as ListedTable).table))
  const entries: Record<string, ResourceEntry> = {}
  given.forEach(([key, one], i) => {
    const rel = rels[i]
    if (!rel || !found.some((trigger) => trigger.table === rel && trigger.name === rowTrigger)) return
    const entry = resourceEntry(members, input.names, one)
    entries[key] = keeps(found, one.input as ListedTable, rel) ? entry : { ...entry, digest: '' }
  })
  // Row triggers on a table no listed resource has, recorded by the resource they keep, which is their first argument,
  // so they are dropped; one of a resource recorded on its own table already is kept apart, under the table it is on.
  for (const trigger of found) {
    const [resource] = trigger.args
    if (trigger.name !== rowTrigger || resource === undefined || rels.includes(trigger.table)) continue
    const key = entries[resource] ? `${resource} on ${trigger.table}` : resource
    entries[key] = { version: members.version, digest: '', table: { schema: trigger.schema, name: trigger.relname } }
  }
  const organizationEntries = await readOrganization(db, organization, input)
  const resources = {
    ...(Object.keys(entries).length > 0 && { [members.name]: entries }),
    ...(Object.keys(organizationEntries).length > 0 && { [organization.name]: organizationEntries }),
  }
  return {
    lastStep: state!.table ? 1 : 0,
    replaceables: { ...(sessions && { sessions: sessionsVersion }), ...(version !== undefined && { members: membersVersion }) },
    names: input.names,
    ...(Object.keys(resources).length > 0 && { resources }),
  }
}
