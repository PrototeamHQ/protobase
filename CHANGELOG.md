# Changelog

Every release of Protobase, cut by the release workflow from the commits since the last one (see the [versioning page](https://docs.protobase.net/reference/versioning/)).

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
