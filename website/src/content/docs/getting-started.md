---
title: Getting started
description: Install the repository, run the ERP and real estate examples and learn the development commands.
---

Protobase is a config-driven admin panel framework for existing Postgres databases. Data config lives in `data.ts`, UI config in `ui.ts`; a Hono server serves the API and a React app renders the admin.

## Setup

Requires Node >= 22.12 (`.nvmrc`) and pnpm 10.12.1.

```sh
pnpm install
```

## Run the ERP example

`examples/erp` is a sample ERP on a real Postgres database, seeded with three years of history. It needs Docker for the database: `pnpm db:up` starts the Postgres container and gives each example its database and a `.env` from its `.env.example`.

```sh
pnpm db:up && pnpm --filter erp db:migrate && pnpm --filter erp db:seed --scale small
pnpm --filter erp auth:migrate                 # Better Auth's tables, in the auth schema
pnpm --filter erp protobase users create you@example.com --generate-password
pnpm --filter erp dev                          # http://localhost:5173
```

`BETTER_AUTH_SECRET` in `examples/erp/.env` signs the session cookies; see [Login with Better Auth](/reference/auth/). `protobase dev` serves the admin app and the API on one port and reloads both on every change ([CLI](/reference/cli/#dev)).

## Run the real estate example

`examples/real-estate` is a rental and property management firm: owners, properties and units, leases and tenants, monthly rent, payments and arrears, and maintenance. Its database sits beside the ERP's in the same Postgres container, and it keeps its own `.env`.

```sh
pnpm db:up && pnpm --filter real-estate db:migrate && pnpm --filter real-estate db:seed --scale small
pnpm --filter real-estate auth:migrate
pnpm --filter real-estate protobase users create you@example.com --role admin --generate-password
pnpm --filter real-estate dev                  # http://localhost:5173
```

## Commands

| Command | Purpose |
| --- | --- |
| `pnpm db:up` / `pnpm db:down` | start or stop the Postgres container; `db:up` also creates the examples' databases and `.env` files |
| `pnpm test` | the unit tests and the PGlite tests in `packages/*/tests/` (Vitest projects `unit` and `pglite`): no Postgres server, subprocess or network |
| `pnpm test:unit` | only the unit tests, next to the code (Vitest project `unit`), fully parallel; starting PGlite or a Postgres client there throws |
| `pnpm test:watch` | `pnpm test` in watch mode |
| `pnpm test:integration` | the database, subprocess and build tests (projects `integration*`), against the Postgres container |
| `pnpm presets:write <version> <dir>` | writes each preset to `<dir>/<name>`: a standalone copy of its example with the `@protobase` packages pinned to `<version>`, which must be on npm, and its own `bun.lock`; needs Bun |
| `pnpm images:context` | the build contexts of the `protobase` and `protobase-dev` images in `dist/images`, at the version in `package.json` (see [Deploy](/guides/deploy/#images)) |
| `pnpm test:presets` | writes each preset as `pnpm presets:write` does it and installs it with Bun from npm (so at a published version), then migrates, seeds, checks, tests and builds it on a database of its own, as a role without superuser rights; needs Bun and the Postgres container |
| `pnpm test:db` | builds the template databases the database tests clone for each run (`protobase_test_template`, `real_estate_test_template`), when missing or older than the examples' migrations and seed; without them those tests skip. Tests never use the `protobase` or `real_estate` databases |
| `pnpm typecheck` | `tsc --noEmit` |
| `pnpm check:boundaries` | dependency-cruiser package rules |
| `pnpm check` | typecheck + test + test:integration + check:boundaries |
| `pnpm storybook` | Storybook on port 6006 |
| `pnpm build-storybook` | static Storybook build |
| `pnpm build:serve` | the serve runtime, `dist/protobase-serve.js` (see [Deploy](/guides/deploy/)) |
| `pnpm docs:dev` | this site on port 4321 |
| `pnpm docs:build` | this site, built into `website/dist/`; fails on broken links |
| `pnpm release --dry-run` | the next version and its changelog, from the commits since the last release (see [Versioning](/reference/versioning/)) |
| `pnpm docs:check` | opens every page of the built site in Chromium and fails on console errors and failed requests; `BASE=https://docs.protobase.net` checks the live site |

Each public import is a package in `packages/` (`@protobase/schema`, `layout`, `query`, `client`, `ui`, `server`, and `cli` for the `protobase` command); `packages/presets` writes the projects a new app starts from and is not published. See [Architecture](/reference/architecture/) for the layout and import rules.
