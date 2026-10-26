# Working on this app

A Protobase app: each resource's data config in `config/<name>/data.ts` and its screens in `config/<name>/ui.ts`, all
exported from `config/index.ts`, over a Postgres database. Reference: https://docs.protobase.net. It starts empty: the
first change adds its first tables and resources.

## Database changes

- Every schema change is a new migration file in `db/migrations/`, numbered after the last one (`006_customers.sql`
  after the auth migrations). Never edit or remove a migration that exists: it has already run on the live database.
- Expand only, where possible: add tables, columns and indexes, and keep what the running app still reads. Rename or
  drop only when asked to, once nothing uses it.

## Never touch

- `auth/` and the `auth` schema: sign-in and accounts.
- `.github/workflows/`.

## Scripts

The platform runs `db:migrate` (the auth schema's migrations included), `typecheck` and `test`, with their settings in
the environment: keep them working. Run `typecheck` and `test` before you finish.

`bun run dev` serves the app locally. Nobody can sign in until a user exists in the database it points at: its startup
message prints the exact command while there are none, `bun run protobase users create you@example.com
--generate-password`. A database with users already, such as the hosted one, needs a new email for a local user.
