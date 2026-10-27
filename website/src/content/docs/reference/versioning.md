---
title: Versioning
description: How Protobase is versioned and released, the commit convention behind it, and which bundles a serve runtime runs.
---

Protobase follows [semantic versioning](https://semver.org). Every push to `main` that holds a fix, a feature or a breaking change is released: the pushed commit is tagged `v<version>`, and a [GitHub release](https://github.com/PrototeamHQ/protobase/releases) of that tag holds the release's changes. Every `@protobase` package is then published to npm at that version. A release adds no commit to `main`: a release's version is its tag, not a `package.json` field, so the version in the repository's `package.json` files is not bumped. `CHANGELOG.md` lists only the releases from before releases stopped committing.

## Versions below 1.0

Until 1.0, a minor version may break, so it plays the part a major plays from 1.0 on:

| Commits since the last release | Below 1.0 | From 1.0 |
| --- | --- | --- |
| a breaking change (`feat!:`, a `BREAKING CHANGE:` footer) | minor: 0.1.4 → 0.2.0 | major: 1.4.2 → 2.0.0 |
| a feature (`feat:`) | patch: 0.1.4 → 0.1.5 | minor: 1.4.2 → 1.5.0 |
| a fix (`fix:`) | patch: 0.1.4 → 0.1.5 | patch: 1.4.2 → 1.4.3 |
| anything else (`docs:`, `test:`, `chore:`, ...) | no release | no release |

The first release is 0.1.0.

The version goes up from the newest `v<version>` tag reachable from the released commit, never from a newer tag elsewhere in the repository. When the repository already has a tag above that one, the commit is on a maintenance branch whose next minor and major versions are taken, so a fix or a feature there is released as a patch: with `v0.3.0` released from `main`, a branch from `v0.2.4` releases 0.2.5, then 0.2.6. A breaking change cannot be released from a maintenance branch: the release fails, and there is no override, so the breaking change has to be removed from the branch's history.

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

`bun install` points git at `.githooks/` (the `prepare` script), whose `commit-msg` hook runs commitlint on every commit. The release workflow checks every pushed commit again before it releases.

## Releases

`.github/workflows/release.yml` runs on every push to `main`:

1. The checks of `ci.yml` (`bun run check`, the smoke test on Node, the docs build, the Storybook play tests and the docs check), of the tests and steps the changes since the last `v<version>` tag affect (see What a push checks in `CONTRIBUTING.md`), and commitlint over the pushed commits. When the push cuts a release, the Postgres suite (`bun run test:postgres`, on Postgres and PgBouncer) runs in full as well, whatever changed.
2. `bun run release` (`scripts/release.mjs`, with [commit-and-tag-version](https://github.com/absolute-version/commit-and-tag-version)) computes the next version and its notes from the commits since the last `v<version>` tag, as above, and tags the pushed commit `v<version>`. It commits nothing and changes no file. Without a fix, feature or breaking change it tags nothing.
3. The tag is pushed, and the GitHub release of the tag gets the notes.
4. `scripts/stamp-version.mjs` writes the tag's version into every `package.json` and `bun.lock` in the runner, never committed. `scripts/publish.mjs` then builds every package at the tag to `dist` and packs it with Bun (the private `@protobase/presets` is not published), and npm, under Node, publishes it with [trusted publishing](https://docs.npmjs.com/trusted-publishers) and provenance; there is no npm token. A run that cut no release publishes nothing.
5. Once npm serves the packages, the tag's version is written into the `package.json` files the same way, and `bun run images:context <image>` writes each image's build context at the tag from them, and the images are built natively for `linux/amd64` and `linux/arm64` and pushed to GitHub's registry as `ghcr.io/prototeamhq/protobase:<version>` and `ghcr.io/prototeamhq/protobase-dev:<version>` (see [Deploy](/guides/deploy/#images)). A release whose publish failed has no images.

When `main` moved on while the checks ran, the run of the newer push releases both. `bun run release --dry-run` prints the next version and its notes without tagging anything.

Running the workflow by hand with a tag (`gh workflow run release.yml -f tag=v0.1.0`) only publishes: the packages at that tag and its version, skipping every version npm already has, and the images, which repeats a missed or half-done publish. `node scripts/publish.mjs --dry-run` packs the packages and shows what `npm publish` would send, and `node scripts/publish.mjs --pack`, which CI runs, packs every package without asking npm or publishing. Each package on npm trusts `release.yml` of `PrototeamHQ/protobase` as its publisher; a new package has to be published once by hand before that can be set up. The workflow pushes the images with its own token; a new image on GitHub's registry starts out private and is made public once in its package settings.

## Bundles and runtimes

The CLI makes one version check, when it starts. The project's `package.json` lists its `@protobase` packages at one version specifier, the same for every one of them, and semver must say the CLI's version satisfies it. A `^0.14.0` project runs on a 0.14.2 CLI and is refused by a 0.15.0 or a 1.2.0 one before any command runs:

```
error: This project asks for Protobase ^0.14.0, and this CLI is Protobase 0.15.0: run it with a CLI whose version ^0.14.0 holds
```

The copies installed for the project must also be ones the CLI runs: its version in their caret range, which from 1.0 on is the same major and below 1.0, where a minor may break, the same minor, never older. A specifier that is no range, such as `workspace:*`, says no version, so only the installed copies are checked. A project that lists no `@protobase` package, or has no `package.json`, has nothing to check.

Within its caret range the CLI stays backwards compatible, so a platform builds every app with the newest CLI in the caret range of the app's version. Nothing else compares versions: not the build, not the serve runtime. `protobase build` writes the version of the copies it used into [the manifest](/reference/cli/#the-manifest) as `protobase`: the building CLI's own in a bundled project, the `@protobase` packages its lockfile installed in a locked one, and a host serves the bundle on the runtime of that version. The check is `checkProjectVersion` in `packages/cli/src/version/project-version.ts`.

## Plugins

[Plugins](/reference/plugins/) are versioned by a plugin API of their own: `@protobase/ui`'s `pluginApi`, 1 so far. A plugin's `plugin.json` names the plugin API it is built for and a range of Protobase versions, from the `@protobase/ui` it is built with on. An app loads a plugin of its own plugin API whose range holds its version, and turns off any other, telling its admins why.

A project's own `protobase.ui.tsx` is a plugin of its bundle, so the same rule holds for it. The admin app it runs in, the shell, is prebuilt once per release; a host that serves a newer release's shell for a bundle whose plugins all load in it gives the app that release's fixes without a rebuild (see [the shell](/reference/plugins/#the-shell)).

Releases keep the plugin API, below 1.0 too, where a minor version may change the config: they add exports to `@protobase/ui`, but remove or change one, add or remove a module the app shares with plugins, or move to a new major version of React only with a new plugin API. A test pins every export of `@protobase/ui` (`packages/ui/src/plugins/plugin-api.exports.json`) and fails when one goes away while `pluginApi` stays the same.

## Runtime updates

An app whose host can update its runtime, such as a hosting platform, can show admins an **Update** button in the top bar. `PROTOBASE_RUNTIME_URL` (or `runtimeUpdates.url` in `protobase.config.ts`) names the host's endpoint, and `/api/meta` passes it on as `runtime: { url }` to callers with the `admin` role only. Without it, or for anyone else, the app shows nothing and asks nothing.

The app sends the signed-in user's API token as `Authorization: Bearer <token>` (verified like an [assistant backend](/reference/assistant/#another-backend) does) and expects:

- `GET {url}`: `200` with `{ version, latest, updateAvailable, indicator, policy, nextUpdateAt, updating }`. `version` is the runtime the app is pinned to, `policy` one of `immediate`, `weekly`, `scheduled` or `manual`, and `nextUpdateAt` when that policy applies `latest` (null when it never will or nothing is pending).
  It may also send `updateStage` (`job` or `build`) and `updateStartedAt` while an update runs, and `lastUpdate`, `{ toVersion, outcome, errorCode, message, finishedAt }` with `outcome` one of `succeeded`, `unchanged` or `failed` and `message` plain text for the app's owner. A host that leaves them out gets the dialog without them.
- `POST {url}/update`: applies `latest` now, `202` with the same body; `409` when the app is on it already or an update is running. A refusal's message, as `{ error: { code, message } }` or a problem's `detail`, is shown as it is.

The app reads the status on load and every half hour, every 5 seconds while an update runs. It shows the button only while `updateAvailable` and `indicator` are both true; the button opens the two versions, when the policy updates or how far the running update is, how the last update ended, and **Update now**. When and whether to update is the host's setting. `createRuntimeClient({ url, token })` of `@protobase/client` calls the same endpoint from code, with `status()` and `update()`.

## A new version under an open page

`/api/meta` names the Protobase version the server runs as `protobaseVersion`. When a page that is open finds that the server moved to another version, it keeps what it shows and stops reading `/api/meta`, so nothing changes under the user until they reload. The app then offers the reload: in a sidebar shown at full width, a banner above the profile with the app's name, that it was updated, and a click that reloads; otherwise a notice with **Reload**, which stays until it is closed, and a **Reload page** button in the top bar. The reload asks first while a form holds unsaved changes or a save is under way.
