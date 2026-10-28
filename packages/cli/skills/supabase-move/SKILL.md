---
name: supabase-move
description: Finish a move from Supabase to Protobase after `protobase import supabase`, item by item from its report (supabase-import/report.md), until `protobase doctor` and the app's typecheck pass. Use it when a project has supabase-import/report.md, or when asked to finish or complete a Supabase import.
---

# Finishing a move from Supabase

`protobase import supabase` converts what it can and writes `supabase-import/report.md` with the rest. This skill works through that report, one `## ` section at a time, in the report's order. The `protobase` skill beside this one has the guides and reference it links to.

## Rules

- **Never invent data.** Copy only what the Supabase project states: a URL, a header, a schedule, a column's value. A secret's value is never in the report or the code: leave it for the user to enter. A column with nothing to go on stays NULL; add no `DEFAULT` that stands in for "unknown".
- **Rewrite only what the project's database lacks.** Before rewriting the use of an extension, check that database, not the report alone: a Pro or Business app's own Postgres runs every extension it had on Supabase, and there pg_net, pg_cron, pgmq and Vault stay as they are.

  ```sh
  psql "$DATABASE_URL" -Atc "select name, installed_version is not null from pg_available_extensions where name in ('pg_net', 'pg_cron', 'pgmq', 'supabase_vault') order by 1"
  ```

  An extension that is listed but not installed is created by a migration (`create extension if not exists <name>;`), not rewritten.
- **Database changes are new migrations** in the project's migrations folder, numbered after the last one, applied with the project's own migrate script (`db:migrate`). Never edit the import's `NNN_supabase_schema.sql` once it is applied, and never change the database by hand.
- **Never loosen a check** to make it pass: not the scan guard, not `strict`, not a `// @ts-ignore`.
- When a conversion needs a decision only the user can make, such as a paid service to replace one Supabase ran, stop on that item, say what it needs, and go on with the others.

## The loop

1. Read `supabase-import/report.md` and work through its sections below.
2. `protobase migration`, then the project's migrate script: it writes the jobs schema, the events' capture and the rest of what the config now enables.
3. The app's typecheck (`tsc --noEmit`, or its `typecheck` script).
4. `protobase doctor --env DATABASE_URL`.
5. Fix what 3 and 4 report and go back to 2, until both pass.
6. Tell the user what is theirs to do: the variables to fill in, items you stopped on, and `--storage-url` if the files are not copied yet.

## The report, section by section

### Rows loaded

Nothing to do: each table's count matched the source before the load committed.

### API keys

Unless `protobase.config.ts` sets `apiKeys`, add `PROTOBASE_PUBLISHABLE_KEY` and `PROTOBASE_SECRET_KEY` to `.env.example` with empty values: the user enters the keys, never you. Then point every `createClient` at the app's `/api/sb` with the publishable key, in place of the Supabase project's URL and anon key, reading both from the app's own settings, not the Supabase ones. See [Supabase client API](../protobase/references/reference/supabase-rest.md#keys-and-roles).

### Sign-in

Passwords need nothing: the import's migrations carry them over. For each provider listed with accounts:

- one Better Auth has built in, such as `github` or `microsoft`: add it to `createAuth`'s `socialProviders` in `auth/auth.ts` under that id, with the client id and secret read from environment variables named after it (`GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`), added empty to `.env.example`. See [Sign-in with GitHub](../protobase/references/reference/auth.md#sign-in-with-github). The values are the ones the Supabase project used: the user enters them;
- one it has not built in: stop on it and say the user needs Better Auth's generic OAuth plugin under that id;
- one not carried over: nothing to do.

Leave giving the admins their role to the user, as the report says: only they know who the admins are.

### Made again

Nothing to do: the project's database has these extensions and the load made each item again there.

### Recurring jobs

The import wrote these in `jobs/`. Wire `jobs/index.ts` into `protobase.config.ts`'s `jobs` if the report says it is not, then run step 2 of the loop. See [Jobs](../protobase/references/reference/jobs.md#recurring-jobs).

### Cron jobs

Each line is a pg_cron job, its schedule, its command and why it did not come over.

- Calls `net.http_get` or `net.http_post`, and the database has pg_net: schedule it again with `cron.schedule` in a migration, as it was, when the database has pg_cron, or keep its SQL as a recurring job when it does not.
- Calls pg_net, and the database has none: a recurring job in `jobs/<name>.ts` with `defineJob({ name, schedule, timezone, run })`, of the same name and schedule, whose `run` makes the same request with `fetch`: the same method, URL, headers and body. A header or URL that read a Vault secret reads `requireEnv('<NAME>')` instead (see Vault secrets). Throw when the response is not `ok`, so the failure shows. Export it from `jobs/index.ts`.
- A schedule recurring jobs do not take, such as `30 seconds`: the closest cron expression only if the user agrees; otherwise leave it and say so.
- Inactive: ask the user whether it should run before making it a job.

### Live tables

Nothing to do but step 2 of the loop, which writes their capture triggers.

### Realtime tables

Give each table a resource with `.live()` in `config/` where the app listens to its changes (look for `postgres_changes` with this table in the app's client code). A table without a primary key needs one first, as a migration, only when the user agrees. See [Supabase Realtime](../protobase/references/reference/supabase-realtime.md).

### Vault secrets

Each secret moves to an environment variable the user enters again. Name it after the secret, upper case (`stripe_key` → `STRIPE_KEY`), and:

- add it to `.env.example` (create it if missing) with an empty value and the secret's description as a comment;
- where code read it (`vault.decrypted_secrets` in SQL, a function or a cron job), read `requireEnv('<NAME>')` in TypeScript instead. SQL that needs the secret moves into a job or function that does;
- never write the value anywhere, and never put one in `.env.example`.

### pgsodium encrypted columns

Each column holds ciphertext only Supabase's key opens, so the values come from the user, never from the imported column. The import's migration left out pgsodium's labels, decrypted views and encrypting triggers: the decrypted view stays in Supabase, so make no view or trigger again for it.

Then:

- ask the user to export the column's values decrypted from its decrypted view in Supabase, with the table's primary key, and to write them over the ciphertext; never guess or derive a value;
- once the column holds those values, declare the field `.encrypted()` (see the `protobase` skill's encrypted fields), change the rules, validators and hooks that read it, and run `protobase encryption apply`. Never run it while a column still holds Supabase's ciphertext: it would encrypt the ciphertext as if it were the value.

### pgmq queues

With pgmq in the database, make each queue again in a migration (`select pgmq.create('<name>')`, or `pgmq.create_partitioned`); the user sends the messages again, since the report gives only their count. Without pgmq, move the queue's producers and consumers to a Protobase job: `defineJob` with the consumer's work as `run`, and `jobs.enqueue('<name>', payload)` where SQL called `pgmq.send`. See [Jobs](../protobase/references/reference/jobs.md#from-sql).

### Extensions left out

For each, find what uses it: `grep -n '<extension>\|<schema>\.' db/migrations/*supabase_schema.sql` and the app's code. A use the app's code can take over (`pgjwt` → `jose` in a function, `http` → `fetch` in a job, `pg_hashids` → an npm package) moves there. A use that needs the extension itself, such as PostGIS columns, needs a database that has it: stop on it and tell the user.

### To convert

- A hypertable: a plain table, or one partitioned by time with a migration; its rows came over empty, so the user copies them from Supabase with `INSERT … SELECT`. Do not make them up.
- A function in plv8, plls or plcoffee: rewrite it in plpgsql in a migration, keeping its name, arguments and result; or as a Protobase API function when nothing in SQL calls it.

### HTTP triggers

Each line is a trigger, its table, and the function it calls (`supabase_functions.http_request` for a Database Webhook). The report lists them only when the database lacked pg_net; check again, as above.

Without pg_net, replace each with an event and a subscription:

1. On the table's resource, declare the event the trigger fired on: `e.created()`, `e.updated()`, `e.deleted()` or `e.crud()`, with a `when` for its `WHEN` clause. See [Events](../protobase/references/reference/events.md).
2. Export a `subscription(...)` from the config module with that event, and as target: `function: '<name>'` when the URL was one of the app's own Edge Functions (`.../functions/v1/<name>`), otherwise `url` with the URL the trigger named. Copy its headers into `headers`, a secret one from the environment. A receiver that reads Supabase's payload (`type`, `table`, `schema`, `record`, `old_record`) gets it through `body`. See [Webhooks](../protobase/references/reference/webhooks.md).
3. Drop the trigger, and a trigger function only it used, in a migration.

### Storage files

Ask the user to run `protobase import supabase --storage-url https://<ref>.supabase.co` with their project's secret key in `SUPABASE_SERVICE_ROLE_KEY`, unless `supabase-import/storage.md` says the files are copied. Never ask for the key in the conversation.

### Edge Functions

`supabase/functions` keeps the Deno originals, which the app no longer runs: add `supabase` to the `exclude` of `tsconfig.json` so the typecheck leaves them out, and remove the folder only when the user says so. Look in each for `waitUntil(`: work in it that can outlast about 10 seconds after the response, such as sending mail, calling a slow API or a loop over many records, moves into a job enqueued instead (`await job.enqueue(db, payload)`), since a host stops an idle app and loses work still running. See [Functions moved from Supabase](../protobase/references/guides/api-functions.md#functions-moved-from-supabase).

### Packages added

Run the project's install (`npm install`, `bun install`, ...). A `npm:@jsr/...` range needs `@jsr:registry=https://npm.jsr.io` in `.npmrc`.

### Edge Function code to rewrite

Each line is `<file>:<line>: <what>`. Rewrite each for Node and Bun as [Deno and Supabase's runtime](references/deno.md) says, keeping what the code does.

### Indexes the scan guard needs

Each `error` doctor printed ends in `fix: create index ...`. Add each index in a migration of its own, apply it, and run doctor again.
