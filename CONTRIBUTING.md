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

## Layout snapshots

`bun run test:dom` builds Storybook and compares the layout of the main pages (a list with filters, a list of cards and a record with actions, on desktop and phone) with the snapshots in `scripts/dom-snapshots/layouts`. A snapshot is the element tree with each element's classes, role and the computed CSS that places it, read with a plugin's stylesheet loaded after the app's, as the app loads a project's UI. CI runs the same comparison.

When a layout changes, the check prints the changed lines and writes before and after screenshots of each changed page to `screenshots/dom/`, the before ones from a Storybook built at the commit that last saved the snapshots. If the change is a regression, fix it; if it is intended, save the new layouts with `bun run test:dom:update` and commit them with the change.

## Releases

Every push to `main` with a fix, feature or breaking change is released by `.github/workflows/release.yml`: version, `CHANGELOG.md`, tag and GitHub release. Below 1.0 a breaking change bumps the minor and a feature or fix the patch. `bun run release --dry-run` shows the next release. The rules, and which bundles a serve runtime runs, are on the [Versioning](https://docs.protobase.net/reference/versioning/) page.
