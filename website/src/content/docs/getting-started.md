---
title: Getting started
description: Install the repository, run the ERP and real estate examples and learn the development commands.
---

Protobase is a config-driven admin panel framework for existing Postgres databases. Data config lives in `data.ts`, UI config in `ui.ts`; a Hono server serves the API and a React app renders the admin.

## Setup

Requires Bun 1.4.2, which installs the repository and runs its scripts and tests, and Node 22.12 or later (`.nvmrc`) for the smoke test on Node.

```sh
bun install
```

## Run the ERP example

`examples/erp` is a sample ERP on a real Postgres database, seeded with three years of history. It needs Docker for the database: `bun run db:up` starts the Postgres container and gives each example its database and a `.env` from its `.env.example`.

```sh
bun run db:up && bun run --cwd examples/erp db:migrate && bun run --cwd examples/erp db:seed --scale small   # the ERP's tables and Better Auth's
bun run --cwd examples/erp protobase users create you@example.com --generate-password
bun run --cwd examples/erp dev                          # http://localhost:5173
```

`BETTER_AUTH_SECRET` in `examples/erp/.env` signs the session cookies; see [Login with Better Auth](/reference/auth/). `protobase dev` serves the admin app and the API on one port and reloads both on every change ([CLI](/reference/cli/#dev)).

## Run the real estate example

`examples/real-estate` is a rental and property management firm: owners, properties and units, leases and tenants, monthly rent, payments and arrears, and maintenance. Its database sits beside the ERP's in the same Postgres container, and it keeps its own `.env`.

```sh
bun run db:up && bun run --cwd examples/real-estate db:migrate && bun run --cwd examples/real-estate db:seed --scale small
bun run --cwd examples/real-estate protobase users create you@example.com --role admin --generate-password
bun run --cwd examples/real-estate dev                  # http://localhost:5173
```

## Commands

| Command | Purpose |
| --- | --- |
| `bun run db:up` / `bun run db:down` | start or stop the Postgres container; `db:up` also creates the examples' databases and `.env` files |
| `bun run test` | the unit tests and the PGlite tests in `packages/*/tests/` (Vitest projects `unit` and `pglite`): no Postgres server, subprocess or network |
| `bun run test:unit` | only the unit tests, next to the code (Vitest project `unit`), fully parallel; starting PGlite or a Postgres client there throws |
| `bun run test:watch` | `bun run test` in watch mode |
| `bun run test:integration` | the database, subprocess and build tests (projects `integration*`), against the Postgres container |
| `bun run test:smoke` / `node --run test:smoke` | the CLI on Bun or on Node builds the ERP and serves its bundle, whose `€` must come back intact; part of `test:integration` on Bun |
| `bun run presets:write <version> <dir>` | writes each preset to `<dir>/<name>`: a standalone copy of its example with the `@protobase` packages pinned to `<version>`, which must be on npm, and its own `bun.lock` |
| `bun run images:context` | the build contexts of the `protobase` and `protobase-dev` images in `dist/images`, at the version in `package.json` (see [Deploy](/guides/deploy/#images)) |
| `bun run test:presets` | writes each preset as `bun run presets:write` does it and installs it with Bun from npm (so at a published version), then migrates, seeds, checks, tests and builds it on a database of its own, as a role without superuser rights; needs the Postgres container |
| `bun run test:db` | builds the template databases the database tests clone for each run (`protobase_test_template`, `real_estate_test_template`), when missing or older than the examples' migrations and seed; without them those tests skip. Tests never use the `protobase` or `real_estate` databases |
| `bun run typecheck` | `tsc --noEmit` |
| `bun run check:boundaries` | dependency-cruiser package rules |
| `bun run check` | typecheck + test + test:integration + check:boundaries |
| `bun run storybook` | Storybook on port 6006 |
| `bun run build-storybook` | static Storybook build |
| `bun run build:serve` | the serve runtime, `dist/protobase-serve.js` (see [Deploy](/guides/deploy/)) |
| `bun run docs:dev` | this site on port 4321 |
| `bun run docs:build` | this site, built into `website/dist/`; fails on broken links |
| `bun run release --dry-run` | the next version and its changelog, from the commits since the last release (see [Versioning](/reference/versioning/)) |
| `bun run docs:check` | opens every page of the built site in Chromium and fails on console errors and failed requests; `BASE=https://docs.protobase.net` checks the live site |

Each public import is a package in `packages/` (`@protobase/schema`, `layout`, `query`, `client`, `ui`, `server`, and `cli` for the `protobase` command); `packages/presets` writes the projects a new app starts from and is not published. See [Architecture](/reference/architecture/) for the layout and import rules.
