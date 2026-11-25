create schema if not exists channels;

create table if not exists channels.sends (
  id bigint generated always as identity primary key,
  resource text not null,
  key text not null,
  event text not null,
  payload jsonb not null,
  sent_at timestamptz not null default now()
);

create index if not exists sends_sent_at on channels.sends (sent_at);

create or replace function channels.send(resource text, key text, event text, payload jsonb) returns void
  language sql security definer set search_path = ''
  as $$ insert into channels.sends (resource, key, event, payload) values (send.resource, send.key, send.event, send.payload) $$;

revoke execute on function channels.send(text, text, text, jsonb) from public;
