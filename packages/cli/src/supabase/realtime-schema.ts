/**
 * Supabase's `realtime.messages`, unpartitioned, with the columns its policies may read, `realtime.topic()`, and
 * `realtime.send()` and `realtime.broadcast_changes()` as Supabase Realtime defines them, which broadcast from the
 * database: a message inserted in the table, which the server takes out of it once its transaction commits and sends to
 * the channels joined on its topic. `send()` stamps a message with the clock rather than the transaction's start, so
 * the messages of one transaction keep their order. The server's probes of a private channel's policies insert in
 * transactions they roll back, which send nothing.
 */
export const realtimeSchemaSql = `create schema realtime;

create table realtime.messages (
  topic text not null,
  extension text not null,
  payload jsonb,
  event text,
  private boolean,
  updated_at timestamp without time zone not null default now(),
  inserted_at timestamp without time zone not null default now(),
  id uuid not null default gen_random_uuid() primary key
);

create index messages_broadcasts on realtime.messages (inserted_at) where extension = 'broadcast';

create function realtime.topic() returns text language sql stable as $$ select nullif(current_setting('realtime.topic', true), '')::text $$;

create function realtime.send(payload jsonb, event text, topic text, private boolean default true) returns void language plpgsql as $$
declare
  generated_id uuid;
  final_payload jsonb;
begin
  begin
    generated_id := gen_random_uuid();
    if payload ? 'id' then
      final_payload := payload;
    else
      final_payload := jsonb_set(payload, '{id}', to_jsonb(generated_id));
    end if;
    execute format('set local realtime.topic to %L', topic);
    insert into realtime.messages (id, payload, event, topic, private, extension, inserted_at)
    values (generated_id, final_payload, event, topic, private, 'broadcast', clock_timestamp());
  exception
    when others then
      raise warning 'WarnSendingBroadcastMessage: %', sqlerrm;
  end;
end;
$$;

create function realtime.broadcast_changes(topic_name text, event_name text, operation text, table_name text, table_schema text, new record, old record, level text default 'ROW') returns void language plpgsql as $$
declare
  row_data jsonb := '{}'::jsonb;
begin
  if level = 'STATEMENT' then
    raise exception 'function can only be triggered for each row, not for each statement';
  end if;
  if operation = 'INSERT' or operation = 'UPDATE' or operation = 'DELETE' then
    row_data := jsonb_build_object('old_record', old, 'record', new, 'operation', operation, 'table', table_name, 'schema', table_schema);
    perform realtime.send(row_data, event_name, topic_name);
  else
    raise exception 'Unexpected operation type: %', operation;
  end if;
exception
  when others then
    raise exception 'Failed to process the row: %', sqlerrm;
end;
$$;

alter table realtime.messages enable row level security;
grant usage on schema realtime to anon, authenticated, service_role;
grant select, insert, update, delete on realtime.messages to anon, authenticated, service_role;
`
