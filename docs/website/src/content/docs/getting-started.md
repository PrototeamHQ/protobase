---
title: Getting started
description: Start an app with npm create protobase, on a new database or one you have, install the repository, run the ERP, real estate and property portal examples and learn the development commands.
---

Protobase is a config-driven admin panel framework for existing Postgres databases. Each resource's data config lives in `config/<resource>/data.ts` and its UI config in `ui.ts`, all exported from `config/index.ts`; the rest of the app, its sign-in, jobs, files and API settings, is one object of data in [`protobase.config.ts`](/reference/config/). A Hono server serves the API and a React app renders the admin. Coding agents get the guides and reference of the installed version with [`protobase skill install`](/reference/cli/#skill).

An app's own React code, its components, field types and actions, is a [plugin](/reference/plugins/): built on its own against a plugin API that Protobase's releases keep, and loaded by the admin app when it starts. Protobase maintains the admin app, the API and the server, and a plugin keeps working as the app moves to newer releases, with their fixes and features, without changes of its own. Below 1.0 a new minor version may still change the config, and the bundle is built again for it; the plugins' code stays as it is (see [Who maintains what](/reference/plugins/#who-maintains-what)).

## Start an app

`npm create protobase my-app` asks which preset to start from, scratch (the default), the ERP or real estate, writes the project into `my-app`, with the `@protobase` packages in `devDependencies` at the caret range of the latest release, so it is [bundled](/reference/versioning/#bundled-and-locked-projects): dev, the build and its scripts run the CLI's own copies, and a newer CLI in that range updates it with no change to its files. It prints the next steps. Without a folder it asks for one too. `--preset <name>` picks the preset without asking; without a terminal it takes scratch. `bun create protobase` and `pnpm create protobase` do the same, and take `--preset` without the `--` that npm needs. It needs Node 22.12 or later. Each preset has an `AGENTS.md` with the rules for a coding agent that changes the app, such as a new migration file for every schema change.

```sh
npm create protobase my-app
npm create protobase my-app -- --preset real-estate
```

The project comes with its own Postgres for development: a `docker-compose.yml` with Postgres 18, started by `bun run db:up` and stopped by `bun run db:down`, on port 55432 or, when something listens there already, the next free one. Its `.env` points at that database and has a `PROTOBASE_SECRET` of its own. Without Docker, set `DATABASE_URL` in `.env` to a Postgres database of yours. The next steps install it with Bun, which runs the project's scripts, start the database, migrate it, load the preset's base data, if it has any, create a user and run `bun run dev`. For scratch:

```sh
cd my-app
bun install
bun run db:up
bun run db:migrate
bun run protobase users create you@example.com --generate-password
bun run dev                         # http://localhost:5173
```

### The first table

A scratch app starts without resources, so `protobase doctor` refuses it until it has one. A table comes in through a migration, the next file in `db/migrations/`, and `scaffold` writes its resource from the database:

```sh
# db/migrations/007_customers.sql: create table customers (id bigint generated always as identity primary key, name text not null);
bun run db:migrate
bun run protobase scaffold --ui --yes
bun run protobase doctor
```

`scaffold` writes `config/customers/data.ts` and `ui.ts` and exports them from `config/index.ts`, where Protobase finds every resource, view and page. `bun run dev` shows the new list at once. The [Data config](/reference/data-config/) and [UI config](/reference/ui-config/) say what else a resource can be.

### On an existing database

Given the URL of a Postgres database you already have, `npm create protobase` makes the project on that database:

```sh
npm create protobase 'postgres://user:password@localhost:5432/shop'
bun create protobase 'postgres://user:password@localhost:5432/shop'
pnpm create protobase 'postgres://user:password@localhost:5432/shop'
```

It connects read-only and names the database and its Postgres version, then asks for the folder, the database's name by default (`npm create protobase my-app <url>` names it). It writes the scratch preset there, with the URL in `.env`, the URL without its password in `.env.example`, and no `docker-compose.yml`, and installs its packages with Bun, or with npm without Bun. It then lists the tables the project's [`scaffold`](/reference/cli/#scaffold) writes resources over, and what it leaves out, with why: views, tables without a primary key or a unique index on columns that are never null, and Protobase's own tables. It asks:

- which tables become resources: numbers, ranges such as `2-4` or names, separated by commas, all of them by default. The tables those point to through foreign keys come too, since a relation needs the resource of its table, and it names them;
- whether each gets a `ui.ts` with its names and list, yes by default;
- whether to review the field proposed for each column, as `scaffold` asks it, no by default.

Then it runs that `scaffold` in the project and prints the next steps. Without a terminal it asks nothing: the folder is the database's name, and every table gets a resource and a `ui.ts`. Quote the URL, as a shell reads `?` and `&` in it. `--preset` is refused with a URL: the project starts from scratch.

It never writes to the database. The first of the next steps does: `bun run db:migrate` adds the `auth` schema that sign-in keeps its users in, and the `migrations` schema, where the script records the migrations it applied in `migrations.applied`. A `public.schema_migrations` another migration tool keeps is left as it is.

On a Supabase database, which it knows by its `auth` and `storage` schemas and its `supabase_admin` role, as [`import supabase`](/reference/cli/#import-supabase) does, the `auth` schema is Supabase Auth's, and the project changes nothing in it. It leaves out `auth`, `storage` and the platform's other schemas, such as `realtime` and `supabase_migrations`, as Supabase's own tables. The project reads Supabase's users through a view over `auth.users` and keeps only its own sign-in data, in a schema of its own, `app_auth`: it points `protobase.config.ts` at the view, with [`users.keyTable`](/reference/auth/#a-view-over-another-systems-users), and writes migrations in place of those of Protobase's own user table: Better Auth's tables in `app_auth`, pointing at `auth.users`, then the view, its side table of the columns only Better Auth has, and each user's account with their Supabase password and social providers. `bun run db:migrate` applies them as the `postgres` role a Supabase connection string signs in as, and Supabase's users sign in with their own passwords, under their own ids. You can create, disable and delete users from either side, and a name changed in Supabase shows at once. <gap>A user who signs up through Supabase Auth later is a user of the project at once but cannot sign in with a password because sharing passwords with Supabase Auth is not implemented.</gap> Supabase's phone-only and anonymous users are not users of the project, since sign-in needs an email. A ban set in the project stays the project's own, while a ban set in Supabase holds in the project too.

```sh
cd shop
bun run db:migrate                  # the first write to the database
bun run protobase users create you@example.com --generate-password
bun run dev                         # http://localhost:5173
```

## Admin over an existing database

For a Postgres database you already have, `npm create protobase <database-url>` makes the project, as [above](#on-an-existing-database). [Admin over an existing database](/guides/existing-database/) does it by hand, in a folder of your own: install the packages, scaffold the config from the tables, check it with `doctor`, add sign-in and its tables, create the first admin and run `protobase dev`.

## Docs as Markdown

Every page of these docs is also Markdown at its address plus `.md`: `https://docs.protobase.net/reference/cli/` is also `https://docs.protobase.net/reference/cli.md`. The code a page shows from example files is written out in it, and its live demos are left out, so a coding agent or a chat assistant reads the page whole. In a project, [`protobase skill install`](/reference/cli/#skill) gives coding agents the docs of the installed version.

The rest of this page works in a clone of this repository, on its example apps in `tests/apps`.

## Setup

Requires Bun 1.4.4, which installs the repository and runs its scripts and tests, and Node 22.12 or later (`.nvmrc`) for the smoke test on Node.

```sh
bun install
```

## Run the ERP example

`tests/apps/erp` is a sample ERP on a real Postgres database, seeded with three years of history. It needs Docker for the database: `bun run db:up` starts the Postgres container and gives each example its database and a `.env` from its `.env.example`.

```sh
bun run db:up && bun run --cwd tests/apps/erp db:migrate && bun run --cwd tests/apps/erp db:seed --scale small   # the ERP's tables and Better Auth's
bun run --cwd tests/apps/erp protobase users create you@example.com --generate-password
bun run --cwd tests/apps/erp dev                          # http://localhost:5173
```

`PROTOBASE_SECRET` in `tests/apps/erp/.env` signs the session cookies; see [Login with Better Auth](/reference/auth/). `protobase dev` serves the admin app and the API on one port and reloads both on every change ([CLI](/reference/cli/#dev)). Its startup message says how to sign in: while the database has no users, it prints the exact `users create` command for the first admin. It stops with a clear message when another server holds its port; pass `--port 5174` to run a second app beside it.

## Run the real estate example

`tests/apps/real-estate` is a rental and property management firm: owners, properties and units, leases and tenants, monthly rent, payments and arrears, and maintenance. Its database sits beside the ERP's in the same Postgres container, and it keeps its own `.env`.

```sh
bun run db:up && bun run --cwd tests/apps/real-estate db:migrate && bun run --cwd tests/apps/real-estate db:seed --scale small
bun run --cwd tests/apps/real-estate protobase users create you@example.com --role admin --generate-password
bun run --cwd tests/apps/real-estate dev                  # http://localhost:5173
```

## Run the property portal example

`tests/apps/property-portal` is a public portal of homes for sale and for rent in the Netherlands and Spain. Visitors browse and filter the listings without signing in, through the [anonymous role](/reference/access/#anonymous-access); members save searches of the listings that mail them new homes, and keep favorites and notes that only they see. The seed makes two members, `anna@portal.example` and `bram@portal.example`, and an admin, `admin@portal.example`, all with the password `property-portal-demo`.

```sh
bun run db:up && bun run --cwd tests/apps/property-portal db:migrate && bun run --cwd tests/apps/property-portal db:seed --scale small
bun run --cwd tests/apps/property-portal dev              # http://localhost:5173
```

## Commands

| Command | Purpose |
| --- | --- |
| `bun run db:up` / `bun run db:down` | start or stop the Postgres container; `db:up` also creates the examples' databases and `.env` files |
| `bun run test` | the unit tests and the snapshot tests in `packages/*/tests/` and `tests/` (Vitest projects `unit*` and `snapshot*`): no Postgres server, subprocess or network. A snapshot test replays the SQL recorded for it from Postgres in `<test>.sql.json` |
| `bun run test:record` | runs the snapshot tests on the Postgres container instead and writes their recordings, after building their templates (`bun run test:db snapshots`); run it when a change makes a snapshot test fail with `stale snapshot` |
| `bun run test:unit` | only the unit tests, next to the code (Vitest projects `unit`, whose files share their modules, and `unit-isolated`, for those that mock a module or change a global), fully parallel; starting a Postgres client there throws |
| `bun run test:watch` | `bun run test` in watch mode |
| `bun run test:integration` | the database, subprocess and build tests (projects `integration*`), against the Postgres container, among them the real-Postgres tests (`*.postgres.test.ts`) |
| `bun run test:smoke` / `node --run test:smoke` | the CLI on Bun or on Node builds the ERP and serves its bundle, whose `€` must come back intact; part of `test:integration` on Bun |
| `bun run presets:write <version> <dir>` | writes each preset to `<dir>/<name>`: a standalone copy of its example with the `@protobase` packages in `devDependencies`, bundled, in the caret range of `<version>` (`^x.y.z`, which below 1.0 covers only that minor) and its own `bun.lock` at exactly `<version>`, which must be on npm |
| `bun run images:context` | the build contexts of the `protobase` and `protobase-dev` images in `dist/images`, at the version in `package.json` (see [Deploy](/guides/deploy/#images)) |
| `bun run test:presets` | writes each preset as `bun run presets:write` does it and installs it with Bun from npm (so at a published version), then migrates, seeds, checks, tests and builds it on a database of its own, as a role without superuser rights; needs the Postgres container |
| `bun run test:postgres` | the Postgres suite in `tests/postgres/` (Vitest project `postgres`): the ERP's medium seed and the planner's statistics on it, and the jobs and event delivery through PgBouncer; needs the Postgres and PgBouncer containers and `bun run test:db postgres` |
| `bun run test:db` | builds the template databases the database tests clone for each run (`protobase_test_template`, `real_estate_test_template`, `property_portal_test_template`, all at small scale, and the empty, auth and jobs `snapshot_*_test_template` the real-Postgres and end-to-end tests clone), when missing or older than what they are built from; without them those tests skip. `bun run test:db postgres` builds the Postgres suite's (`protobase_medium_test_template`, the ERP at medium scale), `bun run test:db snapshots` the ones `test:record` records on (`snapshot_*_test_template`). Tests never use the `protobase`, `real_estate` or `property_portal` databases |
| `bun run typecheck` | `tsc --noEmit` |
| `bun run check:boundaries` | dependency-cruiser package rules |
| `bun run check` | typecheck, the unit, snapshot, integration and end-to-end tests a change affects (all of them without `CHECK_BASE`), and check:boundaries |
| `bun run storybook` | Storybook on port 6006 |
| `bun run build-storybook` | static Storybook build; its toolbar switches every story between light and dark |
| `bun run screenshots` / `bun run screenshots:dark` | screenshots of the stories tagged `website`, in light into `screenshots/`, in dark into `screenshots/dark/` |
| `bun run build:serve` | the serve runtime, `dist/protobase-serve.js` (see [Deploy](/guides/deploy/)) |
| `bun run docs:dev` | this site on port 4321 |
| `bun run docs:build` | this site, built into `docs/website/dist/`; fails on broken links |
| `bun run release --dry-run` | the next version and its changelog, from the commits since the last release (see [Versioning](/reference/versioning/)) |
| `bun run docs:check` | opens every page of the built site in Chromium and fails on console errors and failed requests; `BASE=https://docs.protobase.net` checks the live site |

Each public import is a package in `packages/` (`@protobase/schema`, `layout`, `query`, `client`, `ui`, `server`, `config` for `protobase.config.ts`, `mobile` for `protobase mobile`, and `cli` for the `protobase` command); `packages/presets` writes the projects a new app starts from and is not published; `packages/create-protobase` is `npm create protobase`, with every preset. See [Architecture](/reference/architecture/) for the layout and import rules.
