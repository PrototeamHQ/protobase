import { tableSql } from '../changes/capture-sql'
import type { ListedModel } from './relay-models'

/** The schema of the framework's realtime tables. */
export const realtimeSchema = 'realtime'

/** Who is in each channel whose record lists its members, one row for each person in each channel. */
export const realtimeMembersTable = `${realtimeSchema}.members`

/** Bumped whenever the objects below change, so the next migration writes them again. */
const membersVersion = 2
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

/**
 * The members table, keyed by channel so a notice's audience is read by its key, with an index by person for their
 * tickets and co-members; `listed_members`, the user ids one state of a record lists, none once soft-deleted; and the
 * trigger function, which empties a truncated table's, all of its resource as channel tables are plain tables
 * (`refusePartitioned`). After each write that changes a record's key, members or soft
 * delete, as it stands after every trigger before it, it writes the members of the record's old and new keys again
 * from the table: row triggers that run after the write fire once the statement wrote every row, so a statement that
 * swaps two records' keys leaves each key with the members its record lists.
 */
const baseSql = [
  `create schema if not exists ${realtimeSchema}`,
  `create table if not exists ${realtimeMembersTable} (
  resource text not null,
  channel_key text not null,
  user_id text not null,
  primary key (resource, channel_key, user_id)
)`,
  `create index if not exists members_by_user on ${realtimeMembersTable} (user_id, resource)`,
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
  source regclass := tg_relid;
begin
  if tg_op = 'TRUNCATE' then
    delete from ${realtimeMembersTable} m where m.resource = channel_resource;
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

// The triggers on one channel table, then its rows written again from the table as it stands.
const listedTableSql = (listed: ListedTable) => {
  const { resource, table, key, members, deleted } = listed
  return [
    `create trigger ${rowTrigger} after insert or delete or update on ${table} for each row execute function ${realtimeSchema}.members_kept(${argsOf(listed).map(literal).join(', ')})`,
    `create trigger ${truncateTrigger} after truncate on ${table} for each statement execute function ${realtimeSchema}.members_kept(${literal(resource)})`,
    `delete from ${realtimeMembersTable} where resource = ${literal(resource)}`,
    `insert into ${realtimeMembersTable} (resource, channel_key, user_id)
  select ${literal(resource)}, to_jsonb(t) ->> ${literal(key)}, member from ${table} t
  cross join lateral ${realtimeSchema}.listed_members(to_jsonb(t), ${literal(members)}, ${literal(deleted)}) as member
  on conflict do nothing`,
  ]
}

/**
 * The SQL that keeps `realtime.members` for the listed tables: the table and its functions, the triggers of every
 * table that has them dropped (`standing`, as SQL names each), each listed table's written, its rows written again
 * from the table, and the rows of resources no longer listed deleted. Writes made while the triggers are off, such as
 * with `session_replication_role = replica`, are not kept until the next migration that writes it.
 */
export const membersSql = (listed: readonly ListedTable[], standing: readonly string[]) => [
  ...baseSql,
  ...standing.flatMap((table) => [`drop trigger if exists ${rowTrigger} on ${table}`, `drop trigger if exists ${truncateTrigger} on ${table}`]),
  ...listed.flatMap(listedTableSql),
  `delete from ${realtimeMembersTable} where resource <> all(array[${listed.map(({ resource }) => literal(resource)).join(', ')}]::text[])`,
]
