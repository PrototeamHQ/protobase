# Changelog

Every release of Protobase, cut by the release workflow from the commits since the last one (see the [versioning page](https://docs.protobase.net/reference/versioning/)).

## [0.6.0](https://github.com/PrototeamHQ/protobase/compare/v0.5.0...v0.6.0) (2026-10-10)

### ⚠ BREAKING CHANGES

* **server:** a platform sign-in provider from PROTOBASE_SIGN_IN_*; run auth:migrate to upgrade
* **cli,server:** auth schema changes as project migrations for db:migrate, checked at startup

Moving an app back to an earlier release is not supported: below 1.0 a minor version may break. An older release refuses the new `signInPolicy.platformSignIn` column (`text not null`, no default) and sign-in answers 500. To move back anyway, first run `alter table "auth"."signInPolicy" drop column "platformSignIn"`. Before upgrading again, add it back with `alter table "auth"."signInPolicy" add column "platformSignIn" text default 'allowed' not null`.

### Features

* **cli,server:** auth schema changes as project migrations for db:migrate, checked at startup ([5ef236e](https://github.com/PrototeamHQ/protobase/commit/5ef236e1afdd59fbc14024f46b77f77164caf83d))
* **client,ui:** sign in through a ?sign-in=<provider> link, connect providers on the account page ([e6ffccd](https://github.com/PrototeamHQ/protobase/commit/e6ffccd658d89529f3b7e076d2e1a876ed28d5bc))
* **server,cli:** create a user with linked sign-in accounts, and protobase users create --github-id ([5a7933d](https://github.com/PrototeamHQ/protobase/commit/5a7933dbd978acc2a98c6ac122ef9a7f0e062118))
* **server:** a platform sign-in provider from PROTOBASE_SIGN_IN_*; run auth:migrate to upgrade ([f62a86d](https://github.com/PrototeamHQ/protobase/commit/f62a86d74b0313928a72b24c3b91a3bd4ee8f725))

## [0.5.0](https://github.com/PrototeamHQ/protobase/compare/v0.4.1...v0.5.0) (2026-10-10)

### ⚠ BREAKING CHANGES

* **schema,server:** a widget part an app component draws, and the widget() helper

### Features

* **cli:** build and dev with --extend, merging an extension's configs before the project's ([86db663](https://github.com/PrototeamHQ/protobase/commit/86db663b842a7ccb58d52b0fbc665d33e182f4a9))
* **client,ui:** draw widget parts in the dock with the app's components and useBackendData ([ca36f9d](https://github.com/PrototeamHQ/protobase/commit/ca36f9d53c4e6052d1e8d36b93e53a1ed69dfdd1))
* **schema,server:** a widget part an app component draws, and the widget() helper ([d444215](https://github.com/PrototeamHQ/protobase/commit/d444215b1bbf1983694101ec730afc837f053a24))
* **server,ui:** extend a config with others, merging with defineConfig, mergeConfig and mergeUi ([51faaed](https://github.com/PrototeamHQ/protobase/commit/51faaed29d74ff8ec990d5ce9e7c4410cbd79053))
* **server:** app tools in the built-in assistant, with records as the user ([b090ee9](https://github.com/PrototeamHQ/protobase/commit/b090ee94981f2682252143c4f4ff9e15bfbc0c53))

## [0.4.1](https://github.com/PrototeamHQ/protobase/compare/v0.4.0...v0.4.1) (2026-10-10)

### Bug Fixes

* **server:** depend on @simplewebauthn/server so the passkey types in the declarations resolve ([27e238e](https://github.com/PrototeamHQ/protobase/commit/27e238e6befd92497ab62c62d733ad78f4eda1af))

## [0.4.0](https://github.com/PrototeamHQ/protobase/compare/v0.3.5...v0.4.0) (2026-10-10)

### ⚠ BREAKING CHANGES

* **client,ui:** a staff sign-in page, a banner for staff sessions and the log of staff sign-ins
* **server:** emailed codes, passkeys, two-factor and a sign-in policy; run auth:migrate to upgrade
* **client,ui:** emailed codes, passkeys, two-factor steps, account security and a policy page
* **server:** staff sign-in as a person through an operator provider; run auth:migrate to upgrade

### Features

* **client,ui:** a staff sign-in page, a banner for staff sessions and the log of staff sign-ins ([aa2f603](https://github.com/PrototeamHQ/protobase/commit/aa2f603615e6bc43fadd4051e322f773d18e4685))
* **client,ui:** emailed codes, passkeys, two-factor steps, account security and a policy page ([2c1ae90](https://github.com/PrototeamHQ/protobase/commit/2c1ae90264eaf4cba3931b223357bfb17a6251da))
* **server:** emailed codes, passkeys, two-factor and a sign-in policy; run auth:migrate to upgrade ([3e71f4e](https://github.com/PrototeamHQ/protobase/commit/3e71f4e98760dc0f75e7e0d5a3770d370f0da143))
* **server:** staff sign-in as a person through an operator provider; run auth:migrate to upgrade ([fa0313d](https://github.com/PrototeamHQ/protobase/commit/fa0313d57767a2ccb1989bb201e7e348ecd393b1))

## [0.3.5](https://github.com/PrototeamHQ/protobase/compare/v0.3.4...v0.3.5) (2026-10-10)

### Features

* **cli:** build plain ESM bundles for Node and Bun, with Bun's bundler only under --bun ([36e5179](https://github.com/PrototeamHQ/protobase/commit/36e51794c99a3febfc1c6d0767626fdbdfeee04f))
* **client:** a client of the runtime updates endpoint ([a7e68a7](https://github.com/PrototeamHQ/protobase/commit/a7e68a7623b985445ccafcb766b3cbd5ecc0dc3c))
* **cli:** load project files with Vite's module runner so the CLI runs on Node and Bun ([94de5a1](https://github.com/PrototeamHQ/protobase/commit/94de5a1ed2f19dfddc923eb10844647e9e720a03))
* **images:** base protobase-dev on Bun alone, without Node ([eedb7f3](https://github.com/PrototeamHQ/protobase/commit/eedb7f34b1c34fc6429d293b870710f0a2b5289d))
* **server:** name a runtime updates endpoint to admins in /meta ([0d23412](https://github.com/PrototeamHQ/protobase/commit/0d234129c8ce81b135812270587b78d80277d867))
* **ui:** a runtime update button in the top bar ([379ff4f](https://github.com/PrototeamHQ/protobase/commit/379ff4f0437c65493e70b31477bf7e84470e0231))

### Bug Fixes

* **cli:** keep the scratch folder's random name out of bundles that Bun's bundler writes ([4b7faec](https://github.com/PrototeamHQ/protobase/commit/4b7faecd25e28c3dbaa987eb7805138e4957f675))
* **cli:** point to the project's db:up script without assuming pnpm ([9d4352f](https://github.com/PrototeamHQ/protobase/commit/9d4352f294658c2a680147d7e61162c243fbe4ed))
* **ui:** open side panels full screen on phones ([9561119](https://github.com/PrototeamHQ/protobase/commit/95611190be91996304e18e2a0773546df8bc8987))

## [0.3.4](https://github.com/PrototeamHQ/protobase/compare/v0.3.3...v0.3.4) (2026-10-10)

### Bug Fixes

* **ui:** show only the Assistant button's icon on phones ([6a416f7](https://github.com/PrototeamHQ/protobase/commit/6a416f73fedf4e2ec3fb0efe6c8ffd81761c082d))

## [0.3.3](https://github.com/PrototeamHQ/protobase/compare/v0.3.2...v0.3.3) (2026-10-10)

### Bug Fixes

* **server:** greet the SMTP server with the sender's domain instead of [127.0.0.1] ([51e7437](https://github.com/PrototeamHQ/protobase/commit/51e74376b11f0374138fcdadb517f9a2efb504c0))

## [0.3.2](https://github.com/PrototeamHQ/protobase/compare/v0.3.1...v0.3.2) (2026-10-10)

### Bug Fixes

* **cli:** let Bun's bundler write the bundles so Bun reads their non-ASCII text correctly ([38fb2b3](https://github.com/PrototeamHQ/protobase/commit/38fb2b3316d6b7b85bb11a3dee35034cb52a5002))

## [0.3.1](https://github.com/PrototeamHQ/protobase/compare/v0.3.0...v0.3.1) (2026-10-10)

### Bug Fixes

* **ui:** refresh a sidebar group when a record read anew differs from its row ([310cbc9](https://github.com/PrototeamHQ/protobase/commit/310cbc91addbe203a8bca065f05e12d81d09ab62))

## [0.3.0](https://github.com/PrototeamHQ/protobase/compare/v0.2.0...v0.3.0) (2026-10-10)

### ⚠ BREAKING CHANGES

* **server:** keep assistant transcripts in a conversation store and cache their prefix per turn

### Features

* **server:** keep assistant transcripts in a conversation store and cache their prefix per turn ([3882771](https://github.com/PrototeamHQ/protobase/commit/3882771f06cda1f11333021a1fee67c0505d91c9))
* **server:** reasoning effort, cache_control text parts and reasoning details in chat completions ([08e3f67](https://github.com/PrototeamHQ/protobase/commit/08e3f67acab161ce69bb568cee04360926724c88))
* **server:** withCacheBreakpoints marks prompt-cache breakpoints on chat messages ([aeb9661](https://github.com/PrototeamHQ/protobase/commit/aeb9661732c39d3a39bf12b7c03f16c87f87e324))
* **ui:** send the page the user is on with each assistant message ([7b03e48](https://github.com/PrototeamHQ/protobase/commit/7b03e48f755160386bcdc8f985912b350180fb34))

## [0.2.0](https://github.com/PrototeamHQ/protobase/compare/v0.1.6...v0.2.0) (2026-10-10)

### ⚠ BREAKING CHANGES

* **ui:** render assistant backends with generic chat primitives in the shell's dock

### Features

* **client:** a client for assistant backends ([bf5d48c](https://github.com/PrototeamHQ/protobase/commit/bf5d48cf41f8e08c1fcd580595d7233592b1f91c))
* **schema:** the assistant protocol's types, event reducer and event-stream reader ([5da7cd4](https://github.com/PrototeamHQ/protobase/commit/5da7cd4d6d3e5d968e54b2322032d28cddde3f99))
* **server:** name the assistant backend in /api/meta and answer questions with a built-in assistant ([2df1c9a](https://github.com/PrototeamHQ/protobase/commit/2df1c9ae491654cb575f886da71dbaac1de945ca))
* **server:** tool-calling turns, approvals and guarded query tools for the assistant ([aba90a7](https://github.com/PrototeamHQ/protobase/commit/aba90a756ae44c52c9a2e26c552262ad5ae1454c))
* **ui:** render assistant backends with generic chat primitives in the shell's dock ([77b6cac](https://github.com/PrototeamHQ/protobase/commit/77b6cacae2d1a35c339b18af97f83afa274ffe51))

## [0.1.6](https://github.com/PrototeamHQ/protobase/compare/v0.1.5...v0.1.6) (2026-10-09)

### Bug Fixes

* **release:** wait for npm to serve the [@protobase](https://github.com/protobase) packages before writing the image contexts ([e0fa7cc](https://github.com/PrototeamHQ/protobase/commit/e0fa7cc7011a11b67787b8f6db004e352da4f10a))

## [0.1.5](https://github.com/PrototeamHQ/protobase/compare/v0.1.4...v0.1.5) (2026-10-09)

### Features

* **images:** publish ghcr.io/prototeamhq/protobase and protobase-dev at every release ([2d1e1d1](https://github.com/PrototeamHQ/protobase/commit/2d1e1d120cc07062f67a0c288f3885fcf200ef7f))

### Bug Fixes

* **presets:** stop publishing @protobase/presets and write them from a clone with pnpm presets:write ([bbf9b58](https://github.com/PrototeamHQ/protobase/commit/bbf9b58e71d0f9d99cdcebf9b941769c2e1e4d2f))

## [0.1.4](https://github.com/PrototeamHQ/protobase/compare/v0.1.3...v0.1.4) (2026-10-09)

### Features

* **server:** createAuth takes encryptOAuthTokens and an onUserCreated hook ([b84dec5](https://github.com/PrototeamHQ/protobase/commit/b84dec55bc17cef029d90128ca78686720ff020c))

## [0.1.3](https://github.com/PrototeamHQ/protobase/compare/v0.1.2...v0.1.3) (2026-10-09)

### Bug Fixes

* **cli:** doctor checks resources declared on views and materialized views ([6f0df75](https://github.com/PrototeamHQ/protobase/commit/6f0df75aa36692f14b0c94c0bc407efd833cca58))

## [0.1.2](https://github.com/PrototeamHQ/protobase/compare/v0.1.1...v0.1.2) (2026-10-09)

### Features

* **presets:** make the examples standalone presets and publish them as @protobase/presets ([b65e0b6](https://github.com/PrototeamHQ/protobase/commit/b65e0b6d953192ab89c45014bb1177e91e2f608f))

## [0.1.1](https://github.com/PrototeamHQ/protobase/compare/v0.1.0...v0.1.1) (2026-10-09)

### Features

* **server:** social sign-in providers in createAuth, with a Continue with GitHub button ([4bcd207](https://github.com/PrototeamHQ/protobase/commit/4bcd207d329bbf1e971d924c717fa2467ee733b7))
* **ui:** add AssistantDock, and shell actions and rightPanel slots that App passes to AppShell ([67183da](https://github.com/PrototeamHQ/protobase/commit/67183da4a9449eab27bddcbda5bc41bdb18d5ca7))

## 0.1.0 (2026-10-09)

The first public release of the scoped `@protobase/*` packages: `@protobase/cli`, `@protobase/client`, `@protobase/layout`, `@protobase/query`, `@protobase/schema`, `@protobase/server` and `@protobase/ui`.
