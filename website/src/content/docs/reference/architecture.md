---
title: Architecture
description: How the packages are laid out, which package may import which, and where tests and stories live.
---

A Bun workspace of npm packages under the `@protobase` scope, in `packages/<name>`, all released together at one version. `tests/apps/*`, the example apps the tests run on and the presets are written from, are workspace members that consume the packages; `website` is this documentation site (Astro with Starlight), also a workspace member. The workspace root is private and is not published.

## Packages

| Package | Folder | Entry points | Runs in | Depends on |
| --- | --- | --- | --- | --- |
| `@protobase/schema` | `packages/schema` | `@protobase/schema`, `@protobase/schema/png-icons`; `@protobase/schema/internal` for the other packages only | anywhere | no other `@protobase` package |
| `@protobase/layout` | `packages/layout` | `@protobase/layout`, `@protobase/layout/jsx-runtime`, `@protobase/layout/jsx-dev-runtime` | anywhere | `schema` |
| `@protobase/query` | `packages/query` | `@protobase/query` | server | `schema` |
| `@protobase/client` | `packages/client` | `@protobase/client` | anywhere with `fetch` | `schema`, `layout` |
| `@protobase/ui` | `packages/ui` | `@protobase/ui`, `@protobase/ui/theme.css`, `@protobase/ui/styles.css`; the admin app in `src/app` | browser | `schema`, `layout`, `client` |
| `@protobase/server` | `packages/server` | `@protobase/server`, `@protobase/server/auth-store`, `@protobase/server/config-exports`, `@protobase/server/email`, `@protobase/server/vapid`; `@protobase/server/internal` for the other packages only | server | `schema`, `layout`, `query` |
| `@protobase/config` | `packages/config` | `@protobase/config`, `@protobase/config/schema.json` | anywhere | types of `server` only: it runs nothing besides `defineConfig` |
| `@protobase/cli` | `packages/cli` | the `protobase` command (`bin/protobase.mjs`), `@protobase/cli/auth`, `@protobase/cli/runner` | Node and Bun | `config`, `schema`, `layout`, `query`, `server`, `ui` |
| `@protobase/mobile` | `packages/mobile` | none: the Capacitor packages and native plugins `protobase mobile` installs on first use | the app's iOS and Android projects | none |
| `create-protobase` | `packages/create-protobase` | the `create-protobase` command, for `npm create protobase` | Node | none |
| `@protobase/presets` | `packages/presets` | none: private, `bun run presets:write` writes a project per preset | Bun | none; each preset depends on the `@protobase` packages of the major it is written at, locked at that version |
| `tests/apps/*` | | none | any | `@protobase/*` entry points only |

The presets are written from `tests/apps/erp`, `tests/apps/real-estate` and `tests/apps/scratch` (from scratch) by `bun run presets:write <version> <dir>`, run from a clone of this repository; `npm create protobase` (`packages/create-protobase`) writes them too, without a lockfile. Each is a standalone copy with the `@protobase` packages in `devDependencies`, so an app made from it is [bundled](/reference/versioning/#bundles-and-runtimes) and runs on the CLI's own copies, in the caret range of `<version>`, `^x.y.z`, so an app takes the updates semver calls compatible: within that major from 1.0 on, and within that minor below 1.0, where a minor may break, and its own `bun.lock` at exactly `<version>`. Its `tsconfig.json` extends `.protobase/tsconfig.json`, which [`protobase types`](/reference/cli/#types) writes, as `dev`, `build` and its `typecheck` and `test` scripts do first, and its database scripts run with [`protobase run`](/reference/cli/#run). The examples in this repository list the packages in `dependencies`, locked to the workspace's, and their `tsconfig.json` extends nothing: Vite reads it when it transforms their files, and would fail before the file it extends is written. The three declare the same dependencies, so one `node_modules` fits them all, and their `db:migrate` (the auth schema's migrations included), `typecheck` and `test` scripts take their settings from the environment, or a `.env` beside them, and reach nothing outside the project.

The JSX runtime belongs to `@protobase/layout` because a layout file names one package in `@jsxImportSource @protobase/layout`, and TypeScript and Vite look up `jsx-runtime` and `jsx-dev-runtime` under it. Each field type is split along the same lines: its Zod builder is `packages/schema/src/fields/<type>.ts` and its SQL parameter conversion `packages/query/src/fields/<type>.ts`.

Every package lists the packages it imports in its `package.json` (`workspace:*` for its `@protobase` dependencies), so it installs and works on its own. Rules, enforced by `bun run check:boundaries` (`.dependency-cruiser.cjs`):

- A package imports only the `@protobase` packages in the table above, so `@protobase/ui` never reaches `query`, `server` or `cli`, and `@protobase/layout` only `schema`: layouts are built in the config, checked on the server and rendered in the browser.
- `@protobase/config` imports types only, so reading a config loads nothing but it and the config.
- A package imports another by its name and entry point, never by a path into its source.
- A package's code (not its tests and stories) imports only what its `package.json` lists in `dependencies`.
- Examples, their tests and `test-support/` import the packages by name, never by path.
- Only an encrypted field's reveal and the `encryption` commands decrypt its values.
- No circular dependencies.

In this repository, entry points export TypeScript source directly and the CLI runs its source on Bun, or on Node through [tsx](https://tsx.is), so nothing needs a build. The published packages are built to JavaScript in `dist` by `bun run build` and `bun pm pack` (`scripts/publish.mjs`) (see [CLI](/reference/cli/#how-it-runs)). The other builds are for deployment: the serve runtime, `packages/cli/src/serve/main.ts` bundled with its dependencies into `dist/protobase-serve.js` by `protobase build-serve`, the shell, a production build of the admin app (`packages/ui/src/app`) shipped in `@protobase/ui`'s `dist/shell` and the protobase image, and a project's bundle, its config module plus a copy of the shell and the project's `protobase.ui.tsx` built as a [plugin](/reference/plugins/), by `protobase build` (see [CLI](/reference/cli/#build)).

## Tests and stories

- Unit tests: `*.test.ts` next to the code, run by Vitest in a node environment.
- Tests that use a database, a subprocess or the network: `packages/<name>/tests/`, mirroring the source path, and the example apps' in `tests/examples/`. Most database tests are snapshot tests, which replay SQL recorded from Postgres (`<test>.sql.json`); the fixtures, the recording and replay, and the setup they share are in `test-support/` at the root.
- Stories: `*.stories.tsx` next to the component in `packages/ui/src`; Storybook config lives in `.storybook/`.
- Packing leaves tests, stories and their fixtures out of a package (`files` in its `package.json`).

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

`website/` is this site. `bun run docs:dev` serves it on port 4321; `bun run docs:build` writes `website/dist/` and fails on a broken internal link or anchor, so CI runs it on every pull request, followed by `bun run docs:check`, which opens every page in Chromium and fails on a console error or a failed request. Pages are Markdown or MDX in `website/src/content/docs/`, and the sidebar is listed in `website/sidebar.mjs`.

Every push to `main` builds the site and deploys it, and so does running the workflow by hand (`gh workflow run docs.yml`); either way it deploys to the Cloudflare Pages project `protobase-docs`, served at `docs.protobase.net` (`.github/workflows/docs.yml`). The workflow reads the Cloudflare account id from the repository variable `CLOUDFLARE_ACCOUNT_ID` and a token with Cloudflare Pages edit permission from the repository secret `CLOUDFLARE_API_TOKEN`.
