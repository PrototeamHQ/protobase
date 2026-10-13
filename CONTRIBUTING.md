# Contributing

Setup and commands are in the [README](README.md) and [Getting started](https://docs.protobase.net/getting-started/#commands).

## Commit messages

Every commit message follows [Conventional Commits](https://www.conventionalcommits.org), since releases are computed from them:

```
feat(ui): a working global search in the top bar
fix(query): report the failing statement from withStatementTimeout
feat(cli)!: refuse bundles without a Protobase version
docs: the record page runs named actions too
```

- `feat` releases a feature, `fix` a fix; `docs`, `test`, `refactor`, `perf`, `build`, `ci`, `style`, `chore` and `revert` release nothing on their own.
- A breaking change takes a `!` after the type or scope, or a `BREAKING CHANGE:` footer saying what to do instead.
- The subject starts in lowercase and ends without a period; the header and every body line are at most 100 characters.

`bun install` installs a `commit-msg` hook (`.githooks/`) that checks each message with commitlint (`commitlint.config.mjs`); the release workflow checks every commit pushed to `main` again. To check messages by hand: `bun x commitlint --from <commit>`.

## Doc comments and the API reference

The [schema API reference](https://docs.protobase.net/api/schema/) is generated from the doc comments of `@protobase/schema`'s entry point (`packages/schema/src/index.ts`) by TypeDoc and starlight-typedoc while the site builds; the guides and reference pages beside it are written by hand. Every item the entry point exports, and every member of what it exports, such as each builder method, needs a doc comment: `bun run docs:build` fails on one without, as on a broken `{@link}`. Helpers only the `@protobase` packages use are exported from `@protobase/schema/internal` instead, which the reference leaves out. `bun x typedoc --emit none` in `website/` runs the same check in seconds.

A doc comment links a guide or reference page by its file, from the repository's root: `[Access](website/src/content/docs/reference/access.mdx#capabilities)` becomes a link to `/reference/access/#capabilities`. A link to a file that does not exist, or that is no page of the site, fails the build, and so does an anchor the page does not have. The options are in `website/typedoc.json`, the link handling in `website/typedoc-doc-pages.mjs`.

## Layout snapshots

`bun run test:dom` builds Storybook and compares the layout of the main pages (a list with filters, a list of cards and a record with actions, on desktop and phone) with the snapshots in `scripts/dom-snapshots/layouts`. A snapshot is the element tree with each element's classes, role and the computed CSS that places it, read with a plugin's stylesheet loaded after the app's, as the app loads a project's UI. CI runs the same comparison.

When a layout changes, the check prints the changed lines and writes before and after screenshots of each changed page to `screenshots/dom/`, the before ones from a Storybook built at the commit that last saved the snapshots. If the change is a regression, fix it; if it is intended, save the new layouts with `bun run test:dom:update` and commit them with the change.

## Releases

Every push to `main` with a fix, feature or breaking change is released by `.github/workflows/release.yml`: version, `CHANGELOG.md`, tag and GitHub release. Below 1.0 a breaking change bumps the minor and a feature or fix the patch. `bun run release --dry-run` shows the next release. The rules, and which bundles a serve runtime runs, are on the [Versioning](https://docs.protobase.net/reference/versioning/) page.

## The check job's runner

Pull requests run the checks on GitHub's runners. Pushes to `main`, which the release workflow checks, run them on the runner that the repository variable `CHECK_RUNNER` names, or on GitHub's when it is unset. The self-hosted runner `hetzner` runs on the Hetzner server as the `gh-runner` user, with the Postgres service in rootless Podman, and its job-started hook (`/home/gh-runner/hooks/job-started.sh`) refuses any job that is not a push to `main`.

- Use it: `gh variable set CHECK_RUNNER --body hetzner`
- Go back to GitHub's runners: `gh variable delete CHECK_RUNNER`; no commit is needed either way.
- Stop it, on the server: `systemctl disable --now actions.runner.PrototeamHQ-protobase.hetzner`. Delete the variable first, since pushes to `main` wait for a runner that is offline.
