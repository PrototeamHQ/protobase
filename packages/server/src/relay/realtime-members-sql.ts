import { tableSql } from '../changes/capture-sql'
import type { ListedModel } from './relay-models'

/** The schema of the framework's realtime tables. */
export const realtimeSchema = 'realtime'

/** Who is in each channel whose record lists its members, one row for each person in each channel. */
export const realtimeMembersTable = `${realtimeSchema}.members`

/** Bumped whenever the functions below change, so the next migration writes them again. */
export const membersVersion = 3
export const membersComment = `Protobase realtime members ${membersVersion}`

export const rowTrigger = 'realtime_members'
export const truncateTrigger = 'realtime_members_truncated'

/** A channel table whose records list their members, by the SQL names the triggers read. */
export type ListedTable = { resource: string; table: string; key: string; members: string; deleted: string }

/** The table of a channel resource whose records list their members. */
export const listedTable = ({ model, field }: ListedModel): ListedTable => ({
  resource: model.name,
  table: tableSql(model),
  key: model.fields[model.primaryKey[0]!]!.column,
  members: model.fields[field]!.column,
  deleted: model.softDelete === undefined ? '' : model.fields[model.softDelete]!.column,
})

const literal = (text: string) => `'${text.replaceAll("'", "''")}'`

// Step 1 of the relay module: frozen once released, as every step is.
/** The members table, keyed by channel so a notice's audience is read by its key, with an index by person for their tickets and co-members. */
export const membersTableSql = [
  `create schema if not exists ${realtimeSchema}`,
  `create table if not exists ${realtimeMembersTable} (
  resource text not null,
  channel_key text not null,
  user_id text not null,
  primary key (resource, channel_key, user_id)
)`,
  `create index if not exists members_by_user on ${realtimeMembersTable} (user_id, resource)`,
]

/**
 * `listed_members`, the user ids one state of a record lists, none once soft-deleted; and the trigger function. A
 * truncate, of the table or of one of its partitions, writes the resource's members again from the table as it stands,
 * so a truncated partition's siblings keep theirs. After each write that changes a record's key, members or soft
 * delete, as it stands after every trigger before it, it writes the members of the record's old and new keys again
 * from the table: row triggers that run after the write fire once the statement wrote every row, so a statement that
 * swaps two records' keys leaves each key with the members its record lists.
 */
export const membersFunctionsSql = [
  `create or replace function ${realtimeSchema}.listed_members(entry jsonb, members_column text, deleted_column text) returns setof text
language sql immutable as $$
  select distinct member from jsonb_array_elements_text(
    case when (deleted_column = '' or entry ->> deleted_column is null) and jsonb_typeof(entry -> members_column) = 'array' then entry -> members_column else '[]'::jsonb end
  ) as member where member is not null
$$`,
  `create or replace function ${realtimeSchema}.members_kept() returns trigger
language plpgsql as $$
declare
  channel_resource text := tg_argv[0];
  key_column text := tg_argv[1];
  members_column text := tg_argv[2];
  deleted_column text := tg_argv[3];
  old_entry jsonb;
  new_entry jsonb;
  keys text[];
  key_type text;
  -- The table the trigger stands on: the partitioned one for a partition's clone or truncate trigger.
  source regclass := coalesce(pg_partition_root(tg_relid), tg_relid);
begin
  if tg_op = 'TRUNCATE' then
    delete from ${realtimeMembersTable} m where m.resource = channel_resource;
    execute format('insert into ${realtimeMembersTable} (resource, channel_key, user_id)
      select $1, to_jsonb(t) ->> $2, member from %s t cross join lateral ${realtimeSchema}.listed_members(to_jsonb(t), $3, $4) as member
      on conflict do nothing', source)
      using channel_resource, key_column, members_column, deleted_column;
    return null;
  end if;
  if tg_op <> 'INSERT' then old_entry := to_jsonb(old); end if;
  if tg_op <> 'DELETE' then new_entry := to_jsonb(new); end if;
  if tg_op = 'UPDATE' and old_entry -> key_column is not distinct from new_entry -> key_column
    and old_entry -> members_column is not distinct from new_entry -> members_column
    and (deleted_column = '' or old_entry -> deleted_column is not distinct from new_entry -> deleted_column) then
    return null;
  end if;
  keys := array(select distinct k from unnest(array[old_entry ->> key_column, new_entry ->> key_column]) as k where k is not null);
  delete from ${realtimeMembersTable} m where m.resource = channel_resource and m.channel_key = any(keys);
  select format_type(a.atttypid, a.atttypmod) into key_type from pg_attribute a where a.attrelid = source and a.attname = key_column;
  execute format('insert into ${realtimeMembersTable} (resource, channel_key, user_id)
    select $1, to_jsonb(t) ->> $2, member from %s t cross join lateral ${realtimeSchema}.listed_members(to_jsonb(t), $3, $4) as member
    where t.%I = any($5::%s[]) on conflict do nothing', source, key_column, key_type)
    using channel_resource, key_column, members_column, deleted_column, keys;
  return null;
end
$$`,
  `comment on function ${realtimeSchema}.members_kept() is '${membersComment}'`,
]

/** The args of a listed table's row trigger, as `members_kept` reads them. */
export const argsOf = ({ resource, key, members, deleted }: ListedTable) => [resource, key, members, deleted]

// What Postgres keeps of a listed table: refused when it is a partition, or inherits or is inherited from other than
// by partitioning, as its rows are written through a table the triggers do not stand on; and each of its partitions.
const refusedSql = (table: string) => `exists (select from pg_class c where c.oid = ${literal(table)}::regclass and (c.relispartition or (c.relkind <> 'p' and exists (select from pg_inherits i where i.inhrelid = c.oid or i.inhparent = c.oid))))`
const partitionsSql = (table: string) => `select relid from pg_partition_tree(to_regclass(${literal(table)})) where relid <> to_regclass(${literal(table)})`

/**
 * The triggers that keep `realtime.members` on one listed table, written whole: its row trigger, cloned onto its
 * partitions by Postgres, and its truncate trigger on it and on each partition it has as the statements run, then its
 * rows written again from the table. A partition or inheriting table is refused. Writes made while the triggers are
 * off, such as with `session_replication_role = replica`, are not kept until they are written again.
 */
export const listedTableSql = (listed: ListedTable) => {
  const { resource, table, key, members, deleted } = listed
  const args = argsOf(listed).map(literal).join(', ')
  return [
    `do $members$ begin
  if ${refusedSql(table)} then
    raise exception 'realtime.members cannot keep the members of %: a partition or a table in an inheritance tree is not supported as a channel resource whose records list their members; use the partitioned table itself', ${literal(table)};
  end if;
end $members$`,
    `drop trigger if exists ${rowTrigger} on ${table}`,
    `drop trigger if exists ${truncateTrigger} on ${table}`,
    `create trigger ${rowTrigger} after insert or delete or update on ${table} for each row execute function ${realtimeSchema}.members_kept(${args})`,
    `create trigger ${truncateTrigger} after truncate on ${table} for each statement execute function ${realtimeSchema}.members_kept(${args})`,
    `do $members$ declare part regclass; begin
  for part in ${partitionsSql(table)} loop
    execute format('drop trigger if exists ${truncateTrigger} on %s', part);
    execute format('create trigger ${truncateTrigger} after truncate on %s for each statement execute function ${realtimeSchema}.members_kept(%s)', part, ${literal(args)});
  end loop;
end $members$`,
    `delete from ${realtimeMembersTable} where resource = ${literal(resource)}`,
    `insert into ${realtimeMembersTable} (resource, channel_key, user_id)
  select ${literal(resource)}, to_jsonb(t) ->> ${literal(key)}, member from ${table} t
  cross join lateral ${realtimeSchema}.listed_members(to_jsonb(t), ${literal(members)}, ${literal(deleted)}) as member
  on conflict do nothing`,
  ]
}

/**
 * Drops the triggers that keep `realtime.members` on a table, on its partitions too, then the rows of each resource
 * whose row trigger stands nowhere any more, by the resource its first argument names.
 */
export const dropListedSql = (table: string) => [
  `drop trigger if exists ${rowTrigger} on ${table}`,
  `drop trigger if exists ${truncateTrigger} on ${table}`,
  `do $members$ declare part regclass; begin
  for part in ${partitionsSql(table)} loop
    execute format('drop trigger if exists ${truncateTrigger} on %s', part);
  end loop;
end $members$`,
  `delete from ${realtimeMembersTable} m where not exists (select from pg_trigger t where t.tgname = '${rowTrigger}' and t.tgparentid = 0
    and t.tgfoid = '${realtimeSchema}.members_kept()'::regprocedure and convert_from(substring(t.tgargs from 1 for position('\\x00'::bytea in t.tgargs) - 1), 'UTF8') = m.resource)`,
]
