---
title: Architecture
description: How the packages are laid out, which package may import which, and where tests and stories live.
---

A pnpm workspace of npm packages under the `@protobase` scope, in `packages/<name>`, all released together at one version. `examples/*` are workspace members that consume the packages; `website` is this documentation site (Astro with Starlight), also a workspace member. The workspace root is private and is not published.

## Packages

| Package | Folder | Entry points | Runs in | Depends on |
| --- | --- | --- | --- | --- |
| `@protobase/schema` | `packages/schema` | `@protobase/schema` | anywhere | no other `@protobase` package |
| `@protobase/layout` | `packages/layout` | `@protobase/layout`, `@protobase/layout/jsx-runtime`, `@protobase/layout/jsx-dev-runtime` | anywhere | `schema` |
| `@protobase/query` | `packages/query` | `@protobase/query` | server | `schema` |
| `@protobase/client` | `packages/client` | `@protobase/client` | anywhere with `fetch` | `schema`, `layout` |
| `@protobase/ui` | `packages/ui` | `@protobase/ui`; the admin app in `src/app` | browser | `schema`, `layout`, `client` |
| `@protobase/server` | `packages/server` | `@protobase/server` | server | `schema`, `layout`, `query` |
| `@protobase/cli` | `packages/cli` | the `protobase` command (`bin/protobase.mjs`) | Node; `src/serve` also Bun | `schema`, `layout`, `query`, `server`, `ui` |
| `@protobase/presets` | `packages/presets` | none: files only, a project per preset in `dist/<name>` | | none; each preset depends on the `@protobase` packages of its release |
| `examples/*` | | none | any | `@protobase/*` entry points only |

The presets are written from `examples/erp`, `examples/real-estate` and `examples/scratch` (from scratch) when the package is packed: each a standalone copy at the release's version, with its own `bun.lock` and its `.gitignore` as `_gitignore`, since npm leaves `.gitignore` files out of a package. The three declare the same dependencies, so one `node_modules` fits them all, and their `db:migrate`, `auth:migrate`, `typecheck` and `test` scripts take their settings from the environment, or a `.env` beside them, and reach nothing outside the project.

The JSX runtime belongs to `@protobase/layout` because a layout file names one package in `@jsxImportSource @protobase/layout`, and TypeScript and Vite look up `jsx-runtime` and `jsx-dev-runtime` under it. Each field type is split along the same lines: its Zod builder is `packages/schema/src/fields/<type>.ts` and its SQL parameter conversion `packages/query/src/fields/<type>.ts`.

Every package lists the packages it imports in its `package.json` (`workspace:*` for its `@protobase` dependencies), so it installs and works on its own. Rules, enforced by `pnpm check:boundaries` (`.dependency-cruiser.cjs`):

- A package imports only the `@protobase` packages in the table above, so `@protobase/ui` never reaches `query`, `server` or `cli`, and `@protobase/layout` only `schema`: layouts are built in the config, checked on the server and rendered in the browser.
- A package imports another by its name and entry point, never by a path into its source.
- A package's code (not its tests and stories) imports only what its `package.json` lists in `dependencies`.
- Examples, their tests and `test-support/` import the packages by name, never by path.
- No circular dependencies.

In this repository, entry points export TypeScript source directly and the CLI runs its source through [tsx](https://tsx.is), so nothing needs a build. The published packages are built to JavaScript in `dist` by `pnpm build` and `pnpm pack` (see [CLI](/reference/cli/#how-it-runs)). The other builds are for deployment: the serve runtime, `packages/cli/src/serve/main.ts` bundled with its dependencies into `dist/protobase-serve.js` by `protobase build-serve`, and a project's bundle, its config module plus a production build of the admin app (`packages/ui/src/app`) with the project's `protobase.ui.tsx`, by `protobase build` (see [CLI](/reference/cli/#build)).

## Tests and stories

- Unit tests: `*.test.ts` next to the code, run by Vitest in a node environment.
- Tests that start a database (PGlite or Postgres), a subprocess or the network: `packages/<name>/tests/`, mirroring the source path, and the examples' in `tests/examples/`. The PGlite fixtures and setup they share are in `test-support/` at the root.
- Stories: `*.stories.tsx` next to the component in `packages/ui/src`; Storybook config lives in `.storybook/`.
- `pnpm pack` leaves tests, stories and their fixtures out of a package (`files` in its `package.json`).

## Contract

`packages/schema/src/model.ts` is the contract between packages. Change its types deliberately; every package builds against them.

## Filters

Filters are Google AIP-160 text. Parsing, printing, `order_by` and the generic checker come from the standalone `aip-parsers` library (published on npm, entry points `aip-parsers/filter` and `aip-parsers/order-by`). `packages/schema/src/filter/` is the Protobase profile on top of it:

- `profile.ts` registers Protobase's functions (`in`, `search`, `similar`, `regex`, `isNull`, `now`) and turns a `ResourceModel` into the library's schema.
- `parse.ts` / `lower.ts` turn the generic tree into `FilterExpr`; `lift.ts` / `print.ts` go back.
- `check.ts` runs the library checker, then `check-model.ts` for value formats (decimal, bigint, uuid, date, ...), traversal and search fields. `search(...)` and bare words need `.search((r) => [...])` on the resource.
- `where.ts` builds typed filters in code.

`ResourceModel.search` is authoritative for server-side search; `ViewModel.list.search` only seeds the UI's search box.

## Documentation

`website/` is this site. `pnpm docs:dev` serves it on port 4321; `pnpm docs:build` writes `website/dist/` and fails on a broken internal link or anchor, so CI runs it on every pull request, followed by `pnpm docs:check`, which opens every page in Chromium and fails on a console error or a failed request. Pages are Markdown or MDX in `website/src/content/docs/`, and the sidebar is listed in `website/astro.config.mjs`.

Every push to `main` builds the site and deploys it, and so does running the workflow by hand (`gh workflow run docs.yml`); either way it deploys to the Cloudflare Pages project `protobase-docs`, served at `docs.protobase.net` (`.github/workflows/docs.yml`). The workflow reads the Cloudflare account id from the repository variable `CLOUDFLARE_ACCOUNT_ID` and a token with Cloudflare Pages edit permission from the repository secret `CLOUDFLARE_API_TOKEN`.
