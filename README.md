# Protobase

Config-driven admin panel framework for existing Postgres databases. Data config in `data.ts`, UI config in `ui.ts`, Hono server, React UI.

Documentation: **[docs.protobase.net](https://docs.protobase.net)**, built from `website/` ([Getting started](https://docs.protobase.net/getting-started/), [Deploy](https://docs.protobase.net/guides/deploy/), [Architecture](https://docs.protobase.net/reference/architecture/)).

## Packages

npm packages under the `@protobase` scope, all at one version, built from `packages/`:

- `@protobase/schema`: resources, fields, views and access rules (`data.ts`, `ui.ts`)
- `@protobase/layout`: composed pages, with the JSX runtime for `@jsxImportSource @protobase/layout`
- `@protobase/query`: the Kysely queries behind lists, filters, counts and aggregates
- `@protobase/server`: the REST API as a Hono app, with Better Auth sign-in
- `@protobase/client`: a typed fetch client for the API
- `@protobase/ui`: the admin app, and the hooks and components for `protobase.ui.tsx`
- `@protobase/cli`: the `protobase` command (scaffold, doctor, dev, build, serve)

```sh
pnpm add @protobase/cli @protobase/schema @protobase/layout @protobase/server @protobase/ui
```

The projects a new app starts from (ERP, real estate, from scratch) are not on npm: `bun run presets:write <version> <dir>`
writes them from a clone of this repository, each with the `@protobase` packages pinned to `<version>` and its own
`bun.lock`.

Every release also pushes two images to GitHub's registry: `ghcr.io/prototeamhq/protobase:<version>`, the serve
runtime, and `ghcr.io/prototeamhq/protobase-dev:<version>`, Node, Bun and the presets with their dependencies
installed. See [Deploy](https://docs.protobase.net/guides/deploy/#images).

Licensed under the [Apache License 2.0](LICENSE).

## Setup

Requires Bun 1.4.2.

```sh
bun install
bun run check        # typecheck + test + test:integration + check:boundaries
bun run docs:dev     # the documentation site on port 4321
```

The other commands are listed in [Getting started](https://docs.protobase.net/getting-started/#commands).

Commit messages follow Conventional Commits, from which every push to `main` is released; see [CONTRIBUTING.md](CONTRIBUTING.md).
