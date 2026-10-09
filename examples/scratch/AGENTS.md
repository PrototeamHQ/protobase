# Working on this app

A Protobase app: each resource's data config in `config/<name>/data.ts` and its screens in `config/<name>/ui.ts`, all
exported from `config/index.ts`, over a Postgres database. Reference: https://docs.protobase.net. It starts empty: the
first change adds its first tables and resources.

## Database changes

- Every schema change is a new migration file in `db/migrations/`, numbered after the last one (`001_customers.sql`
  first). Never edit or remove a migration that exists: it has already run on the live database.
- Expand only, where possible: add tables, columns and indexes, and keep what the running app still reads. Rename or
  drop only when asked to, once nothing uses it.

## Never touch

- `auth/` and the `auth` schema: sign-in and accounts.
- `.github/workflows/`.

## Scripts

The platform runs `db:migrate`, `auth:migrate`, `typecheck` and `test`, with their settings in the environment: keep
them working. Run `typecheck` and `test` before you finish.
