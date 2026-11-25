create schema if not exists relay;

create or replace function relay.session_ended() returns trigger
language plpgsql as $$
declare
  ids jsonb;
begin
  select jsonb_agg(id::text) into ids from ended;
  if ids is not null then
    perform jobs.enqueue('relay.close-sessions', jsonb_build_object('sessions', ids));
  end if;
  return null;
end
$$;

comment on function relay.session_ended() is 'Protobase relay sessions 1';

drop trigger if exists relay_session_ended on "auth"."session";

create trigger relay_session_ended after delete on "auth"."session" referencing old table as ended for each statement execute function relay.session_ended();

create schema if not exists realtime;

create table if not exists realtime.members (
  resource text not null,
  channel_key text not null,
  user_id text not null,
  primary key (resource, channel_key, user_id)
);

create index if not exists members_by_user on realtime.members (user_id, resource);

create or replace function realtime.listed_members(entry jsonb, members_column text, deleted_column text) returns setof text
language sql immutable as $$
  select distinct member from jsonb_array_elements_text(
    case when (deleted_column = '' or entry ->> deleted_column is null) and jsonb_typeof(entry -> members_column) = 'array' then entry -> members_column else '[]'::jsonb end
  ) as member where member is not null
$$;

create or replace function realtime.members_kept() returns trigger
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
    delete from realtime.members m where m.resource = channel_resource;
    execute format('insert into realtime.members (resource, channel_key, user_id)
      select $1, to_jsonb(t) ->> $2, member from %s t cross join lateral realtime.listed_members(to_jsonb(t), $3, $4) as member
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
  delete from realtime.members m where m.resource = channel_resource and m.channel_key = any(keys);
  select format_type(a.atttypid, a.atttypmod) into key_type from pg_attribute a where a.attrelid = source and a.attname = key_column;
  execute format('insert into realtime.members (resource, channel_key, user_id)
    select $1, to_jsonb(t) ->> $2, member from %s t cross join lateral realtime.listed_members(to_jsonb(t), $3, $4) as member
    where t.%I = any($5::%s[]) on conflict do nothing', source, key_column, key_type)
    using channel_resource, key_column, members_column, deleted_column, keys;
  return null;
end
$$;

comment on function realtime.members_kept() is 'Protobase realtime members 3';
