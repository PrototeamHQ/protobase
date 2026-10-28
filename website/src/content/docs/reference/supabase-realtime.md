---
title: Supabase Realtime
description: The Realtime-compatible /api/sb/realtime/v1 that supabase-js's channel() joins, for postgres_changes checked under the subscriber's RLS policies, broadcasts and presence, on public and private channels, and broadcasts from the database.
---

An app with API keys also serves `/api/sb/realtime/v1/websocket`, the socket that supabase-js's `channel()` joins. An app moved from Supabase keeps its `postgres_changes` listeners, broadcasts and presence: point the client at the app's `/api/sb` and give it the publishable key.

```ts
import { createClient } from '@supabase/supabase-js'

const supabase = createClient('https://my-app.example.com/api/sb', 'sb_publishable_...')
supabase
  .channel('my-todos')
  .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'todos', filter: 'done=eq.false' }, (payload) => console.log(payload.new))
  .subscribe()
```

## Keys, roles and tokens

The keys are `apiKeys` in `protobase.config.ts`, `{ publishable_key, secret_key }`, or else `PROTOBASE_PUBLISHABLE_KEY` and `PROTOBASE_SECRET_KEY`. The socket sends the key in its URL and is refused with `401` without a key of the app. Each channel joins with the client's access token: a signed-in user's token makes it `authenticated` with the token's claims, the publishable key alone `anon`, the secret key alone the app's own role. A token the client refreshes on an open socket replaces the channel's; a channel whose token expires is closed with a `Token has expired` system message, as on Supabase.

The server serves the socket when the host gives `createAdmin` its WebSocket upgrade: `protobase serve` does, on Bun and Node, and so does `protobase dev`, beside Vite's hot reload socket. An edit to the project under `protobase dev` closes the open sockets with code `1012`, and supabase-js reconnects to the rebuilt API.

## Which tables

A channel may listen to the tables of the resources with [`.live()`](/reference/live/), by `schema` (`*` for any), `table` (every live table of the schema when left out), `event` (`INSERT`, `UPDATE`, `DELETE` or `*`) and `filter`. A table that is not live is refused when the channel joins, with Supabase's message; [`import supabase`](/reference/cli/#import-supabase) makes the tables of the project's `supabase_realtime` publication live. A filter is Supabase's: `column=operator.value`, with `eq`, `neq`, `lt`, `lte`, `gt`, `gte`, `in.(a,b)`, `like`, `ilike`, `match`, `imatch`, `is` and `isdistinct`, `not.` before the operator, and several conditions joined by commas, all of which must hold. Postgres compares each value as the column's type. A filter Postgres would refuse under the subscriber's role, such as `id=eq.abc` on an integer column, a column the role may not select or a pattern that does not compile, refuses the join with an error, as on Supabase; one that fails later, such as on a column dropped since, ends only its own channel with an error. <gap>A subscriber's slow `match` or `imatch` pattern cannot be kept from costing the other subscribers of its role a batch of changes because evaluating each pattern once per check is not implemented.</gap> <gap>A channel cannot `select` columns because that is not supported yet.</gap>

## Broadcast and presence

Channels on the same topic exchange broadcasts and see each other's presence, as on Supabase, private channels among themselves and public ones among themselves:

```ts
const room = supabase.channel('room', { config: { broadcast: { self: false, ack: true }, presence: { key: 'alice' } } })
room
  .on('broadcast', { event: 'cursor' }, ({ payload }) => console.log(payload))
  .on('presence', { event: 'sync' }, () => console.log(room.presenceState()))
  .subscribe(async (status) => {
    if (status !== 'SUBSCRIBED') return
    await room.track({ online_at: new Date().toISOString() })
    await room.send({ type: 'broadcast', event: 'cursor', payload: { x: 1, y: 2 } })
  })
```

A broadcast reaches the topic's other channels, and the sender's own with `self`; with `ack`, `send` resolves once the server has it. Binary payloads go to clients on the default serializer (`vsn` 2.0.0) only. Presence follows Phoenix Presence: a channel tracks one presence under its `presence.key` (a random one when it names none), tracking again replaces it, and channels with presence enabled get the state when they join and each join and leave after, their own included. A channel that leaves, closes or whose token expires leaves the presence it tracked.

Limits, near Supabase's Free plan, apply per socket and per topic. A socket sends at most 100 broadcast and presence messages a second, joins at most 100 times a second and holds at most 100 channels; on each channel it sends at most 5 presence updates in 30 seconds, also counted across a rejoin. A topic takes 100 broadcasts a second, whoever sends them, so one busy sender can use up a topic's budget. A topic is at most 255 bytes, and a tracked presence at most 10 000 bytes of JSON. A message over a limit gets an error reply and goes to no one, where Supabase would close the channel. A frame over 256 KiB closes the socket with 1009. It closes with 1008 when the client leaves more than 4 MiB unread, or sends more than 300 messages or 4 MiB while earlier ones wait, such as behind a token check.

### Several processes

By default, one process serves the app, and broadcasts and presence go between its channels. When several processes serve it behind one address, set [`realtime: { processes: 'many' }`](/reference/config/api/#realtime) and apply the migration [`protobase migration`](/reference/cli/#migration) writes. Every channel on a topic then hears its broadcasts and presence, whichever process it joined, and so do broadcasts over the REST endpoint and from the database. Private and public channels of a topic stay apart across processes as on one. The processes share them through the `realtime_relay` schema of the app's database: each adds what it sends, and reads what the others sent ten times a second while one of its sockets is open, so a broadcast reaches another process's channels within about 100 ms. A topic's 100 broadcasts a second are counted across all the processes. Every 10 minutes, whether or not a socket is open, each process deletes the frames older than a minute and the counts of seconds before it. A process that stops gracefully removes the presence its channels tracked; one that is killed has it removed by the others about 15 seconds after its last heartbeat, and their channels hear the leaves.

### Broadcast without a channel

A backend or an edge function broadcasts without joining a channel, as on Supabase: supabase-js's `httpSend()`, and `send()` on a channel that has not joined, send it over `POST /api/sb/realtime/v1/api/broadcast`. The request carries the app's key in `apikey` and, for a user, their token in its bearer, as the socket does, and is answered `202`; one without a key of the app is refused with `401`.

```ts
const room = supabase.channel('room')
await room.httpSend('cursor', { x: 1, y: 2 })
await supabase.removeChannel(room)
```

`POST /api/sb/realtime/v1/api/broadcast` takes Supabase's batch, `{ "messages": [{ "topic": "room", "event": "cursor", "payload": { "x": 1 }, "private": false }] }`, of at most 100 messages, each with an object payload. `httpSend()` sends one message to `POST /api/sb/realtime/v1/api/broadcast/<topic>/events/<event>`, `?private=true` for a private one, with a JSON object or, as `application/octet-stream`, binary bytes. A message reaches the channels joined on its topic, under a broadcast's limits: a body is at most 256 KiB, a topic and an event at most 255 bytes each, and a request that would take a topic over its 100 broadcasts a second is refused with `429` and reaches no one. A public message reaches the topic's public channels; a private one reaches only its private channels that may receive broadcasts, and only when the caller may send broadcasts there by the [policies on `realtime.messages`](#private-channels): a batch drops one it may not send, as Supabase does, and `httpSend()` is refused with `403`. <gap>A policy cannot read a broadcast request's headers in `request.headers` because passing them to the checks is not implemented.</gap>

### Broadcast from the database

SQL and triggers broadcast with Supabase's `realtime.send(payload, event, topic, private)` and `realtime.broadcast_changes(topic, event, operation, table, schema, new, old)`, which [`import supabase`](/reference/cli/#import-supabase) makes in the project's database. A trigger as Supabase's docs write one keeps working:

```sql
create function public.todos_broadcast() returns trigger security definer language plpgsql as $$
begin
  perform realtime.broadcast_changes('todos:' || coalesce(new.list_id, old.list_id), tg_op, tg_op, tg_table_name, tg_table_schema, new, old);
  return null;
end
$$;

create trigger todos_broadcast after insert or update or delete on public.todos for each row execute function public.todos_broadcast();
```

```ts
supabase
  .channel('todos:42', { config: { private: true } })
  .on('broadcast', { event: 'INSERT' }, ({ payload }) => console.log(payload.record))
  .subscribe()
```

Each call inserts a message into `realtime.messages` in the caller's transaction, as on Supabase, so a transaction rolled back sends nothing. Within a second of its commit, the server takes the message out of the table and sends it to the channels joined on its topic, in the order the transaction sent them, with the message's id in the payload's `id` and in the broadcast's `meta.id`. `broadcast_changes()` sends `{ operation, table, schema, record, old_record }`, `record` and `old_record` each the whole row or `null`. `private` is `true` unless the call says `false`, as on Supabase: a private message reaches only the topic's private channels whose [policies](#private-channels) let them receive broadcasts, and a public one only its public channels. A message goes under the topic's 100 broadcasts a second, and one whose topic or event is over 255 bytes or whose payload is over 256 KiB is dropped. The server reads the table while one of its sockets is open, and a message no channel hears is dropped, as on Supabase. A call as a role the policies on `realtime.messages` do not let insert sends nothing and raises a warning, as Supabase's does, so a trigger function that sends for its callers is `security definer`. Every process serving the app deletes the broadcast messages more than 48 hours old, whether or not a socket is open: once it starts, then every 10 minutes. The margin covers `inserted_at`, a time without a zone, stamped in the sending session's time zone. <gap>A project that was not imported cannot call `realtime.send()` without making Supabase's functions in a migration of its own, because Protobase's migrations do not make them.</gap>

## Private channels

A channel joined with `private: true` is authorized as Supabase Realtime Authorization does it: by the row security policies on `realtime.messages`, which say who may receive and who may send each extension's messages, `broadcast` or `presence`, and `realtime.topic()`, the channel's topic without its `realtime:` prefix:

```sql
create policy "members hear their rooms" on realtime.messages for select to authenticated
  using (realtime.messages.extension in ('broadcast', 'presence') and exists (
    select 1 from public.room_members m where m.user_id = (select auth.uid()) and 'room:' || m.room_id = (select realtime.topic())));

create policy "members send to their rooms" on realtime.messages for insert to authenticated
  with check (exists (
    select 1 from public.room_members m where m.user_id = (select auth.uid()) and 'room:' || m.room_id = (select realtime.topic())));
```

```ts
const room = supabase.channel('room:42', { config: { private: true } })
```

When a channel joins, the server checks, under the subscriber's role and claims, whether it may select a `broadcast` message of the topic, and a `presence` one when the channel listens to presence. A channel that may receive neither is refused with Supabase's `Unauthorized: You do not have permissions to read from this Channel topic: room:42`; one that may receive only one of them does not hear the other. The first broadcast and the first presence track a channel sends check whether it may insert such a message; one it may not is answered with an error and goes to no one. What a check finds holds until the channel's next token, which checks again, and a new token that takes away what the old one allowed ends the channel, with `You no longer have permission to read from this Channel topic: room:42`. A policy that fails, such as one calling a function that raises, allows nothing. <gap>A policy cannot read the socket's headers in `request.headers` because passing them to the checks is not implemented.</gap>

[`import supabase`](/reference/cli/#import-supabase) carries a project's policies on `realtime.messages` over. A project that writes its own makes the table first, with Supabase's columns, in a migration:

```sql
create schema realtime;
create table realtime.messages (topic text not null, extension text not null, payload jsonb, event text, private boolean,
  updated_at timestamp not null default now(), inserted_at timestamp not null default now(), id uuid not null default gen_random_uuid() primary key);
create function realtime.topic() returns text language sql stable as $$ select nullif(current_setting('realtime.topic', true), '')::text $$;
alter table realtime.messages enable row level security;
grant usage on schema realtime to anon, authenticated;
grant select, insert on realtime.messages to anon, authenticated;
```

Each check inserts its messages in a transaction it rolls back, so they stay out of the table: the app's database role must own it, or bypass row security, to insert the message a join checks and to take out the messages the database broadcasts. Without `realtime.messages`, every private channel is refused.

## What a subscriber receives

Each change is checked for each subscriber before it is sent. The database needs the `anon` and `authenticated` roles, and the app's role must be allowed to `SET ROLE` to them. In one transaction per batch of changes, the server sets the subscriber's role with `SET LOCAL ROLE` and its claims in `request.jwt.claims` and `request.jwt.claim.sub`, so Supabase's `auth.uid()` and `auth.jwt()` work, reads the changed rows by key, and sends an insert or update only when the table's RLS policies let the subscriber select the row, with the columns its role may select. Subscribers with the same role and claims, such as one user's tabs, are checked once. The check holds one pooled connection per serving process, and only while it runs, never one per socket.

Unlike Supabase, which reads changes from the write-ahead log, the server reads them from the [live updates' notices](/reference/live/#the-table), which keep record keys only. So:

- An insert or update carries the row as it is when it is checked. Several changes of a row between two checks each carry its latest state, and a row deleted or no longer visible by then is not sent. `old_record` holds the primary key alone, as on Supabase without `replica identity full`.
- A delete carries the primary key alone and is not checked against RLS, as on Supabase. A filter on a column other than the key does not match a delete.
- `commit_timestamp` is when the change became a notice, within a second or two of the commit.

Changes reach subscribers within a second or two, the notices being read once a second.
