---
title: Compatibility and moving from other systems
description: Apps written for other systems that keep working on Protobase, and moving their data and code over.
---

## Supabase

- [Supabase import](/reference/cli/#import-supabase): Moves a Supabase project into Protobase, with schema, data, users, functions, storage and scheduled jobs.
- [Supabase client API](/reference/supabase-rest/): supabase-js `from()` and `rpc()` calls keep working, under the tables' RLS policies.
- [Supabase Auth](/reference/auth/#supabase-js-and-supabasessr): `supabase.auth` and `@supabase/ssr` calls keep working.
- [Supabase Storage](/reference/supabase-storage/): supabase-js storage calls keep working, over the app's file storage.
- [Supabase Realtime](/reference/supabase-realtime/): Database changes, broadcast and presence through supabase-js channels, private ones authorized by the policies on `realtime.messages`, broadcasts sent from a server without joining a channel, and broadcasts from the database with `realtime.send()` and `realtime.broadcast_changes()`, across [several processes](/reference/supabase-realtime/#several-processes) serving one app.
- [Edge Functions](/guides/api-functions/#functions-moved-from-supabase): Functions moved from Supabase answer at their old addresses.
