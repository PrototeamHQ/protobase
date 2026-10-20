---
title: Supabase Realtime
description: The Realtime-compatible /realtime/v1 that supabase-js's channel().on('postgres_changes') listens to, each change checked under the subscriber's RLS policies.
---

An app with API keys and [live resources](/reference/live/) also serves `/realtime/v1/websocket`, the socket that supabase-js's `channel()` joins. An app moved from Supabase keeps its `postgres_changes` listeners: point the client at the app and give it the publishable key.

```ts
import { createClient } from '@supabase/supabase-js'

const supabase = createClient('https://my-app.example.com', 'sb_publishable_...')
supabase
  .channel('my-todos')
  .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'todos', filter: 'done=eq.false' }, (payload) => console.log(payload.new))
  .subscribe()
```

## Keys, roles and tokens

The keys are `options.apiKeys` of `createAdmin`, `{ publishable_key, secret_key }`, or else `PROTOBASE_PUBLISHABLE_KEY` and `PROTOBASE_SECRET_KEY`. The socket sends the key in its URL and is refused with `401` without a key of the app. Each channel joins with the client's access token: a signed-in user's token makes it `authenticated` with the token's claims, the publishable key alone `anon`, the secret key alone the app's own role. A token the client refreshes on an open socket replaces the channel's; a channel whose token expires is closed with a `Token has expired` system message, as on Supabase.

The server serves the socket when the host gives `createAdmin` its WebSocket upgrade: `protobase serve` does, on Bun and Node. `protobase dev` does not serve it yet.

## Which tables

A channel may listen to the tables of the resources with [`.live()`](/reference/live/), by `schema` (`*` for any), `table` (every live table of the schema when left out), `event` (`INSERT`, `UPDATE`, `DELETE` or `*`) and `filter`. A table that is not live is refused when the channel joins, with Supabase's message. A filter is Supabase's: `column=operator.value`, with `eq`, `neq`, `lt`, `lte`, `gt`, `gte`, `in.(a,b)`, `like`, `ilike`, `match`, `imatch`, `is` and `isdistinct`, `not.` before the operator, and several conditions joined by commas, all of which must hold. Postgres compares each value as the column's type. `select` of columns is not supported yet; broadcast, presence and private channels neither.

## What a subscriber receives

Each change is checked for each subscriber before it is sent. The database needs the `anon` and `authenticated` roles, and the app's role must be allowed to `SET ROLE` to them. In one transaction per batch of changes, the server sets the subscriber's role with `SET LOCAL ROLE` and its claims in `request.jwt.claims` and `request.jwt.claim.sub`, so Supabase's `auth.uid()` and `auth.jwt()` work, reads the changed rows by key, and sends an insert or update only when the table's RLS policies let the subscriber select the row, with the columns its role may select. Subscribers with the same role and claims, such as one user's tabs, are checked once. The check holds one pooled connection per serving process, and only while it runs, never one per socket.

Unlike Supabase, which reads changes from the write-ahead log, the server reads them from the [live updates' notices](/reference/live/#the-table), which keep record keys only. So:

- An insert or update carries the row as it is when it is checked. Several changes of a row between two checks each carry its latest state, and a row deleted or no longer visible by then is not sent. `old_record` holds the primary key alone, as on Supabase without `replica identity full`.
- A delete carries the primary key alone and is not checked against RLS, as on Supabase. A filter on a column other than the key does not match a delete.
- `commit_timestamp` is when the change became a notice, within a second or two of the commit.

Changes reach subscribers within a second or two, the notices being read once a second.
