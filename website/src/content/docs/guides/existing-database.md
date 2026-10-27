---
title: Admin over an existing database
description: Put an admin on a Postgres database you already have, in six steps, from install to signing in, with every file sign-in needs.
---

You have a Postgres database and want an admin over its tables, without moving the data. This guide goes from an empty folder to signing in to that admin. It takes about fifteen minutes and needs Node 22.12 or later.

`npm create protobase <database-url>` does steps 1, 2 and 4 in one go, in a new project, and writes the migration of step 5 for its `bun run db:migrate` to apply: see [On an existing database](/getting-started/#on-an-existing-database). This guide takes each step by hand, in a folder of your own.

Protobase never changes your tables. Sign-in is the one thing it adds to the database: an `auth` schema with its own tables for users, sessions and signing keys. `protobase migration` writes them as a SQL file you apply yourself, like any other migration, and the app never changes the schema while it runs.

## 1. Install

In a new folder, next to the database's own code or anywhere else:

```sh
npm install @protobase/cli @protobase/config @protobase/schema @protobase/layout @protobase/server @protobase/ui pg kysely
```

Then a `.env` beside it, which every `protobase` command reads:

```sh
DATABASE_URL=postgres://user:password@localhost:5432/shop
# The app's secret, which signs session cookies: generate your own with openssl rand -base64 32
PROTOBASE_SECRET=
PROTOBASE_URL=http://localhost:5173
```

Keep `.env` out of version control.

## 2. Scaffold the config

```sh
npx protobase scaffold --ui
```

It reads the tables, read-only, and writes `config/<resource>/data.ts` and `ui.ts` for each one, and `config/index.ts`. In a terminal it asks about each column: press Enter to accept one, `l` to accept it and every one after it. `--yes` accepts them all without asking, and `--dry-run` shows the files without writing them. A table without a primary key, or a unique index on columns that are never null, is skipped with a warning, and so is a view. What it infers is in the [CLI reference](/reference/cli/#scaffold).

## 3. Check it

```sh
npx protobase doctor
```

It checks the config against the database: each table and column exists, each type fits, and an index serves every filter and sort the admin makes. Each error names the index to add, such as `create index on "public"."orders" ("total");`. Add those with your own migrations, or drop the `.filterable()` or `.sortable()` that needs it.

## 4. Add sign-in

Sign-in is on by default: it takes the app's address and secret from `PROTOBASE_URL` and `PROTOBASE_SECRET` in `.env`, and keeps users, sessions and signing keys in an `auth` schema of their own, next to your tables. `protobase.config.ts` says the rest; the resources in `config/` are found by that path:

```ts
import { defineConfig } from '@protobase/config'

export default defineConfig({
  auth: { roles: ['admin'] },
  // Everyone works in tenant 1.
  authenticate: { tenant: 1 },
})
```

The [config reference](/reference/config/) has every key, and the [auth reference](/reference/auth/) the rest of sign-in: emailed codes, passkeys, two-factor, roles, and a users table the database already has.

## 5. Write and apply the auth tables

```sh
npx protobase migration
```

It compares the database with what sign-in needs and writes `db/migrations/001_auth.sql`: the `auth` schema and its tables. It only adds; it never drops or changes your tables. Read it, then apply it with your migration tool, or with `psql`:

```sh
psql "$DATABASE_URL" -1 -f db/migrations/001_auth.sql
```

After a Protobase upgrade, run `npx protobase migration` again: it writes only what the new version adds, as the next file.

## 6. Create the first admin and sign in

```sh
npx protobase users create you@example.com --generate-password
npx protobase dev
```

The first user is always an admin. The password is printed once. `protobase dev` serves the admin and its API at `http://localhost:5173` (`--port` picks another port); sign in there with that email and password.

## Running scaffold again

When the database gets a new table or column, run `npx protobase scaffold --ui` again. It adds only what is new, and leaves your edits as they are. It leaves out the `auth` schema of step 5 on its own, and says so, as the sign-in tables are no admin pages. It also reports drift: a declared field whose column has gone, or whose type no longer fits.

## Next

- [From a table to an admin](/guides/table-to-admin/): names, columns, filters and record pages for the resources you scaffolded.
- [Deploy](/guides/deploy/): build the app and run it on your own server.
