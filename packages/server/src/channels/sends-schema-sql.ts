/** The schema of SQL's broadcasts to the record channels. */
export const sendsSchema = 'channels'

/**
 * - `sends`: each broadcast SQL sent, inserted in the sender's transaction, taken out by a serving process once
 *   committed, or pruned after 48 hours when none read it.
 * - `send(resource, key, event, payload)`: inserts one. It runs as its owner, the app's role, which alone may call it,
 *   so that no other role, such as one of `/api/sb/rest/v1`'s, sends as the server; a trigger function that sends for
 *   them is `security definer`.
 */
export const sendsSchemaSql = `create schema if not exists ${sendsSchema};

create table if not exists ${sendsSchema}.sends (
  id bigint generated always as identity primary key,
  resource text not null,
  key text not null,
  event text not null,
  payload jsonb not null,
  sent_at timestamptz not null default now()
);

create index if not exists sends_sent_at on ${sendsSchema}.sends (sent_at);

create or replace function ${sendsSchema}.send(resource text, key text, event text, payload jsonb) returns void
  language sql security definer set search_path = ''
  as $$ insert into ${sendsSchema}.sends (resource, key, event, payload) values (send.resource, send.key, send.event, send.payload) $$;

revoke execute on function ${sendsSchema}.send(text, text, text, jsonb) from public;`
