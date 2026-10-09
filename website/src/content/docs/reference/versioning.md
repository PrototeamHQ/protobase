---
title: Versioning
description: How Protobase is versioned and released, the commit convention behind it, and which bundles a serve runtime runs.
---

Protobase follows [semantic versioning](https://semver.org). Every push to `main` that holds a fix, a feature or a breaking change is released: the version that the root and every `@protobase` package's `package.json` share goes up, `CHANGELOG.md` gets the release's changes, and the release is tagged `v<version>` with a [GitHub release](https://github.com/PrototeamHQ/protobase/releases). Every `@protobase` package is then published to npm at that version.

## Versions below 1.0

Until 1.0, a minor version may break, so it plays the part a major plays from 1.0 on:

| Commits since the last release | Below 1.0 | From 1.0 |
| --- | --- | --- |
| a breaking change (`feat!:`, a `BREAKING CHANGE:` footer) | minor: 0.1.4 → 0.2.0 | major: 1.4.2 → 2.0.0 |
| a feature (`feat:`) | patch: 0.1.4 → 0.1.5 | minor: 1.4.2 → 1.5.0 |
| a fix (`fix:`) | patch: 0.1.4 → 0.1.5 | patch: 1.4.2 → 1.4.3 |
| anything else (`docs:`, `test:`, `chore:`, ...) | no release | no release |

The first release is 0.1.0.

## Commit messages

Every commit message follows [Conventional Commits](https://www.conventionalcommits.org), checked by [commitlint](https://commitlint.js.org) with its conventional config (`commitlint.config.mjs`):

```
<type>(<optional scope>)<optional !>: <subject>

<optional body>

<optional footers, e.g. BREAKING CHANGE: what breaks and what to do instead>
```

- **Types:** `feat` and `fix` are released; `docs`, `test`, `refactor`, `perf`, `build`, `ci`, `style`, `chore` and `revert` are not on their own.
- **Scopes** name the part of the repository: `cli`, `query`, `schema`, `server`, `ui`, `erp`, `docs`, ...
- **Subjects** start in lowercase and end without a period; the header and every body line are at most 100 characters.
- **Breaking changes** take a `!` after the type or scope, or a `BREAKING CHANGE:` footer that says what to do instead.

`pnpm install` points git at `.githooks/` (the `prepare` script), whose `commit-msg` hook runs commitlint on every commit. The release workflow checks every pushed commit again before it releases.

## Releases

`.github/workflows/release.yml` runs on every push to `main`:

1. The checks of `ci.yml` (`pnpm check`, the docs build, the Storybook play tests and the docs check) and commitlint over the pushed commits.
2. `pnpm release` (`scripts/release.mjs`, with [commit-and-tag-version](https://github.com/absolute-version/commit-and-tag-version)) computes the next version from the commits since the last `v*` tag, writes it to every `package.json` listed in `.versionrc.json` and to `CHANGELOG.md`, commits them as `chore(release): <version>` and tags `v<version>`. Without a fix, feature or breaking change it changes nothing.
3. The commit and tag are pushed to `main`, and the GitHub release gets the version's `CHANGELOG.md` section.
4. `scripts/publish.mjs` packs every package at the tag (each builds to `dist` in `prepack`; the private `@protobase/presets` is not published) and publishes it to npm with [trusted publishing](https://docs.npmjs.com/trusted-publishers) and provenance; there is no npm token. A run that cut no release publishes nothing.

The release commit does not start the workflow again. When `main` moved on while the checks ran, the run of the newer push releases both. `pnpm release --dry-run` prints the next version and its changelog without changing anything.

Running the workflow by hand with a tag (`gh workflow run release.yml -f tag=v0.1.0`) only publishes: the packages at that tag, skipping every version npm already has, which repeats a missed or half-done publish. `node scripts/publish.mjs --dry-run` packs the packages and shows what `npm publish` would send. Each package on npm trusts `release.yml` of `PrototeamHQ/protobase` as its publisher; a new package has to be published once by hand before that can be set up.

## Bundles and runtimes

`protobase build` writes the Protobase version that built the bundle into [the manifest](/reference/cli/#the-manifest) as `protobase`. The serve runtime knows its own version, inlined into `protobase-serve.js` by `protobase build-serve` and inlined into the CLI's `dist` when the package is built, and read from `@protobase/cli`'s `package.json` when `protobase serve` runs from source in this repository. Before it loads a bundle, it compares the two:

- **From 1.0:** the major versions are the same and the runtime's minor is the bundle's or newer. A 1.4.x runtime serves bundles built by 1.0.0 up to 1.4.x.
- **Below 1.0:** the minor versions are the same. A 0.2.x runtime serves only bundles built by 0.2.x, not those of 0.1.x or 0.3.x.
- **Patches** never matter: a 0.1.2 runtime serves a bundle built by 0.1.7.

Otherwise, and for a bundle whose manifest has no `protobase` version or one that is not `x.y.z`, startup stops with exit code 1 and an error naming both versions:

```
error: dist/protobase.bundle.json: the bundle was built by Protobase 0.2.0 and this runtime is Protobase 0.1.3, which serves bundles built by 0.1.x; rebuild the bundle with Protobase 0.1.x or serve it with a runtime of 0.2.x
```

Rebuild the bundle with the runtime's version of Protobase, or upgrade the runtime to one that serves the bundle. The rule is `bundleVersionProblem` in `packages/cli/src/version/compatibility.ts`.
