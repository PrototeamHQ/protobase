# Protobase

Config-driven admin panel framework for existing Postgres databases. Data config in `data.ts`, UI config in `ui.ts`, Hono server, React UI.

Documentation: **[docs.protobase.net](https://docs.protobase.net)**, built from `website/` ([Getting started](https://docs.protobase.net/getting-started/), [Deploy](https://docs.protobase.net/guides/deploy/), [Architecture](https://docs.protobase.net/reference/architecture/)).

For coding agents, the installed CLI carries an [Agent Skill](https://agentskills.io) that matches its version: run `npx protobase skill install` in a project to write `.agents/skills/protobase/` and `.claude/skills/protobase/` (and `protobase-cloud`, for an app hosted on protobase-cloud, and `supabase-move`, which finishes a `protobase import supabase`), run it again after upgrading the packages, and commit the folders so every checkout, task workers' included, has it. The core is `packages/cli/skills/protobase/SKILL.md`; `bun run docs:skill` writes its references from `website/`, and CI fails when they fall behind the docs.

## Packages

npm packages under the `@protobase` scope, all at one version, built from `packages/`:

- `@protobase/schema`: resources, fields, views and access rules (`data.ts`, `ui.ts`)
- `@protobase/layout`: composed pages, with the JSX runtime for `@jsxImportSource @protobase/layout`
- `@protobase/query`: the Kysely queries behind lists, filters, counts and aggregates
- `@protobase/server`: the REST API as a Hono app, with Better Auth sign-in
- `@protobase/config`: `defineConfig` and the types of `protobase.config.ts`, and the JSON Schema of `protobase.config.json`
- `@protobase/client`: a typed fetch client for the API
- `@protobase/ui`: the admin app, and the hooks and components for `protobase.ui.tsx`
- `@protobase/cli`: the `protobase` command (scaffold, doctor, dev, build, serve)
- `@protobase/mobile`: the Capacitor packages and native plugins that `protobase mobile` builds an app's iOS and Android projects with

Beside them, `create-protobase` starts a new app from a preset (scratch, the default, ERP or real estate), asking
which in a terminal, with a Postgres in Docker for development (`bun run db:up`), then prints the next steps:

```sh
npm create protobase my-app
npm create protobase my-app -- --preset erp   # without asking
```

Given an existing Postgres database's URL instead, it makes the project on that database, reading it only, and asks
which of its tables become resources:

```sh
npm create protobase 'postgres://user:password@localhost:5432/shop'
```

`bun run presets:write <version> <dir>` writes every preset from a clone of this repository, each with the
`@protobase` packages in the caret range of `<version>` (`^x.y.z`, which below 1.0 covers only that minor) and its own
`bun.lock` at exactly `<version>`.

Every release also pushes two images to GitHub's registry: `ghcr.io/prototeamhq/protobase:<version>`, the serve
runtime, and `ghcr.io/prototeamhq/protobase-dev:<version>`, Bun and the presets with their dependencies
installed. See [Deploy](https://docs.protobase.net/guides/deploy/#images).

Licensed under the [Apache License 2.0](LICENSE).

## Setup

Requires Bun 1.4.4, and Node 22.12 or later (`.nvmrc`) for the smoke test on Node (`node --run test:smoke`).

```sh
bun install
bun run check        # typecheck + test + test:integration + check:boundaries
bun run docs:dev     # the documentation site on port 4321
```

The other commands are listed in [Getting started](https://docs.protobase.net/getting-started/#commands).

Commit messages follow Conventional Commits, from which every push to `main` is released; see [CONTRIBUTING.md](CONTRIBUTING.md).
