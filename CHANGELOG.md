# Changelog

Every release of Protobase, cut by the release workflow from the commits since the last one (see the [versioning page](https://docs.protobase.net/reference/versioning/)).

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
