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
- A `feat` commit adds something a user of Protobase can see or call, and is documented (see [Features and docs](#features-and-docs)). A change no user can see is `fix`, `perf`, `refactor` or `chore`.

`bun install` installs a `commit-msg` hook (`.githooks/`) that checks each message with commitlint (`commitlint.config.mjs`); the release workflow checks every commit pushed to `main` again, and the `pr-title` workflow checks the message a squash merge gives a pull request: its title, or the subject of its only commit, with its ` (#<number>)` suffix, over a body that lists each commit's message. To check messages by hand: `bun x commitlint --from <commit>`. `bun install` also writes the protobase skill's references (`packages/cli/skills/protobase/references`) from the docs; they are not committed, and the CLI's build writes them again before it is packed. Run `bun run docs:skill` to see a docs change in them.

## Features and docs

Every feature of Protobase is listed on the docs site: `docs/website/src/content/docs/features.md` links one page per area, and each area page under `docs/website/src/content/docs/features/` lists that area's features, one line each, with `## Subarea` headings where an area has them:

```
- [Name](/page/#anchor) (stability): what someone gets, in one or two plain sentences.
```

The link goes to the heading of the docs page that explains the feature; a feature that no page explains yet has its name without a link. A stable feature has no stability; the others say `(beta)`, `(in development)` or `(coming soon)`. A new area page goes into `features` in `docs/website/sidebar.mjs` and gets a line in `features.md`.

- A feature ships with its docs: the change that adds or changes it updates the page that explains it and, for a new feature, adds its entry.
- Nothing is documented that is not built, unless it is marked coming soon, and only while a task builds it.
- Stable: built, released and complete as documented. Beta: built and released, with the limits its page lists, and it may still change. In development: partly released, not usable on its own yet. Coming soon: documented, not built. The section a non-stable entry links starts with an aside, such as `:::caution[Beta]`, naming what is missing. Stability changes only in a change whose plan says so.
- Public text names no other company or product, unless compatibility with it is the subject; such compatibility sits under the area for compatibility with and moving from other systems.

`bun run features:check`, which CI runs, holds every entry to that grammar and to a heading that exists, every area page to the sidebar and the features page, and every reference page to at least one entry. `bun run features:check --release-rule` also refuses a release with a `feat` commit when no docs page changed since the last release; it is not on in CI or the release workflow yet.

## Doc comments and the API reference

The [schema API reference](https://docs.protobase.net/api/schema/) is generated from the doc comments of `@protobase/schema`'s entry point (`packages/schema/src/index.ts`) by TypeDoc and starlight-typedoc while the site builds; the guides and reference pages beside it are written by hand. Every item the entry point exports, and every member of what it exports, such as each builder method, needs a doc comment: `bun run docs:build` fails on one without, as on a broken `{@link}`. Helpers only the `@protobase` packages use are exported from `@protobase/schema/internal` instead, which the reference leaves out. `bun run docs:api-check` runs the same check in seconds, with the same options, and fails with the same messages.

A doc comment links a guide or reference page by its file, from the repository's root: `[Access](docs/website/src/content/docs/reference/access.mdx#capabilities)` becomes a link to `/reference/access/#capabilities`. A link to a file that does not exist, or that is no page of the site, fails the build, and so does an anchor the page does not have. The options are in `docs/website/typedoc.json`, the link handling in `docs/website/typedoc-doc-pages.mjs`.

## Built-in texts

The texts the admin app and the server write themselves live in one JSON file per language and package: `packages/ui/src/locale/en.json` and `nl.json`, and `packages/server/src/locale/en.json` and `nl.json`, keyed by area (the folder the code is in, such as `app/delete`) and then by id. Each text is an [ICU MessageFormat](https://unicode-org.github.io/icu/userguide/format_parse/messages/) message, the format translation tools read as JSON with ICU, formatted by `intl-messageformat`: values by name (`Delete {title}?`), plurals (`{count, plural, one {# row} other {# rows}}`) and choices (`{dayFirst, select, true {…} other {…}}`). A number is written for the language, and `<lower>{label}</lower>` writes a value in lower case, so a language that keeps its capitals leaves the tag out. Code reads an area with `messages('app/delete')` and calls `text('confirmTitle', { title })`, or `text.rich(…)` when a value is a React node. Every language must have each text English has, and may only name values the English text names; `locale/messages.test.ts` in each package checks both.

## Layout snapshots

`bun run test:dom` builds Storybook and compares the layout of the main pages (a list with filters, a list of cards and a record with actions, on desktop and phone) with the snapshots in `scripts/dom-snapshots/layouts`. A snapshot is the element tree with each element's classes, role and the computed CSS that places it, read with a plugin's stylesheet loaded after the app's, as the app loads a project's UI. CI runs the same comparison.

When a layout changes, the check prints the changed lines and writes before and after screenshots of each changed page to `screenshots/dom/`, the before ones from a Storybook built at the commit that last saved the snapshots. If the change is a regression, fix it; if it is intended, save the new layouts with `bun run test:dom:update` and commit them with the change.

## Snapshot tests

The database tests in `packages/*/tests/` and `tests/` replay SQL recorded from real Postgres, so `bun run test` needs no database. Each file opens its databases with `openSnapshotDb(template)` (`test-support/sql-snapshot.ts`), or with a helper built on it such as `createTestDb` or `createFixtureDb`. `bun run test:record` builds the templates (`bun run test:db snapshots`, from `scripts/test-db/snapshot-templates.ts`), runs every snapshot test on its own clone of one on the Postgres container (the normal `postgres:18`), and writes each query with what Postgres answered to `<test>.sql.json` next to the test. Commit the recordings CI's record job uploads (the `sql-snapshots` artifact): Postgres names the CPU it runs on in `version()`, so a recording made on an Apple Silicon Mac differs from CI's in that line. In a normal run the same database connects to nothing and answers each query from that file. A query whose SQL or params differ from the recording, one the recording lacks, and recorded queries a test no longer runs fail the test with `stale snapshot: run bun run test:record`, even when the app turns the error into a 500. Requests a test sends at the same time may take their recorded answers in another order; the record job's diff still catches a change of order. Commit the recordings with the change that made them.

Record and replay must send the same queries, so the snapshot tests run on Bun, as `bun run` starts them (Node writes some of the same values differently, such as the order of a key's JSON fields), in UTC with a fixed clock (`testClock`, 2026-08-01, after every time in the fixtures) and seeded randomness: `crypto`'s random values and UUIDs, and Ed25519 keys, each test from its own sequence, by its name. What Postgres makes up itself, its clock's times (`now()`, `clock_timestamp()`, a default), its random UUIDs, the OIDs of objects a test creates and the clone's name, comes back as fixed stand-ins, so a recording does not change when nothing else did; the templates must hold none of it. After each test the setup waits until no query has been pending for a moment, so work a test leaves running in the background, such as Better Auth's schema check after `createAuth`, ends within that test. Files that replace a module, change a global or create a Better Auth instance, whose rate limits live in one map per module registry, run in the `snapshot-isolated` project.

A test that depends on timing or on several connections at once (polling, retries with real backoff, advisory locks, a statement timeout firing, `LISTEN`) cannot be replayed and stays a real-Postgres test: a `*.postgres.test.ts` file, run with the integration tests, that opens its databases with `openPostgresDatabase(template)` (`test-support/postgres-database.ts`), each a clone of a template `bun run test:db` builds. Jobs that a test drains (`runtime.drain`) instead of waiting for a worker's poll replay. So does anything random that is not drawn from `crypto` and reaches SQL, such as an ECDSA signature, and the server's transaction ids, which the changes outbox keeps: the test then fails as a stale snapshot, or its recording changes on every run. Keep a recording under about 200 KB: read only the columns a test checks, and seed only the rows it needs. Requests a test sends one after another keep a recording the same from one run to the next. Planner statistics come out the same on every recording only when `analyze` reads every row, so a table above 30k rows needs a higher statistics target (`alter table ... alter column ... set statistics 1000`) and `autovacuum_enabled = off`.

## Releases

Every push to `main` with a fix, feature or breaking change is released by `.github/workflows/release.yml`: a `v<version>` tag and a GitHub release with the notes, without a commit to `main`. Below 1.0 a breaking change bumps the minor and a feature or fix the patch. `bun run release --dry-run` shows the next release. The rules, and which bundles a serve runtime runs, are on the [Versioning](https://docs.protobase.net/reference/versioning/) page.

## What a push checks

A pull request, and the `ci` workflow run by hand (`gh workflow run ci.yml --ref <branch>`), run every test and step. A push to `main`, which the release workflow checks, and a push to an `fm/**` branch run only what their changes affect: on `main` the changes since the last release tag, on a branch those since it left `main`. `bun run check` takes that commit as `CHECK_BASE`; without it, everything runs. CI runs `bun run check` as two jobs side by side: `check` runs `bun run check:unit` (the typecheck, unit and snapshot tests and dependency boundaries) with the packing, and `integration` runs `bun run check:integration` (the integration and end-to-end tests) with the smoke test on Node, on Postgres.

- A test runs when it, or a module it imports, changed (`scripts/affected-tests.mjs`, with Vitest's own selection of `vitest related`). The job log lists each test that runs with the change it imports, and the tests it skips. The rules in `scripts/affected/rules.mjs` add what the module graph cannot see: a test that starts the CLI as a process, and a module loaded or a file read by path. A change to a file every test depends on, such as a `package.json`, `bun.lock`, a tsconfig, `vitest.config.ts`, a workflow or `test-support/`, runs every test, and so does a change to a file that is no module and that no rule reads. The ERP smoke test runs on every push.
- Storybook's build, play tests and layout snapshots (the `storybook` job, in two legs that each play every other story) and the site's `docs:build` and `docs:check` (the `docs` job) run when a change reaches what they are built from (`scripts/affected-site.mjs`).
- The typecheck, the dependency boundaries, the packing and the smoke test on Node run on every push.
- The snapshot recording (`bun run test:record`, its own job) runs when a change reaches what the recordings are made from (`snapshotRecording` in `scripts/affected/rules.mjs`, applied by `scripts/affected-snapshots.mjs`), and weekly on a schedule. It fails when a recording differs from the committed one, which replay cannot see: the same SQL answered differently after a schema, fixture or Postgres change. The job then uploads the new recordings as the `sql-snapshots` artifact.
- The Postgres suite (`bun run test:postgres`, its own job) runs after the recording, when a recording differs from the committed ones at the base (`scripts/affected-recordings.mjs`), or when a change reaches what recordings cannot show: migrations and seeds, the jobs runner, change delivery, the suite itself, or the Postgres setup (`postgresSuite` in `scripts/affected/rules.mjs`, applied by `scripts/affected-postgres.mjs`). The release workflow runs it in full on every push to `main`, as its own job (`postgres-full`) that starts beside the other checks instead of after the recording, and the release waits for both; it also runs weekly on a schedule.
- The Supabase move (`bun run test:supabase-move`, its own job, `tests/supabase-move/client/`) runs when a change reaches it: a Supabase project made on Supabase's Postgres image, moved by the real `protobase import supabase` into a new app, served by `protobase dev` and called by supabase-js. It needs Docker, for Supabase's Postgres and for `pg_dump` and `psql` of `postgres:18` unless `PG_BIN` names a folder with those of version 17 or newer.

A test that reads a file or starts a process by path needs a rule, or a change to that file skips it. `CHECK_BASE=main bun run check` runs what a push of the current branch, with its uncommitted changes, would.

## The check job's runner

Pull requests run the checks on GitHub's runners. Pushes to `main`, which the release workflow checks, and pushes to `fm/**` task branches run them on the runner that the repository variable `CHECK_RUNNER` names, or on GitHub's when it is unset. To have a branch's checks run there, push it as `fm/<task>` and wait for that commit's `ci` run. The self-hosted runners `hetzner-1` to `hetzner-5`, with the label `hetzner`, run on the Hetzner server as the `gh-runner` user, with the Postgres service in rootless Podman, and their job-started hook (`/home/gh-runner/hooks/job-started.sh`) refuses any job that is not a push to `main` or `fm/*`. They run the `check`, `integration`, `storybook`, `docs`, `record`, `postgres` and `supabase-move` jobs side by side (`postgres` after `record`, and on `main` `postgres-full` in its place, beside the others), so a push takes about as long as its slowest job, and the jobs run at a low CPU and IO priority (drop-ins in `/etc/systemd/system/actions.runner.PrototeamHQ-protobase.hetzner-*.service.d/` and `user-1003.slice.d/`) so they do not slow the server's other services. After a reboot the runners, and every other CI runner on the server, start only once `ci-wait-raid-sync.service` sees the RAID arrays in sync: the resync after an unclean shutdown saturates the disks for about 13 minutes, and jobs that start meanwhile time out on their database setup.

- Use it: `gh variable set CHECK_RUNNER --body hetzner`
- Go back to GitHub's runners: `gh variable delete CHECK_RUNNER`; no commit is needed either way.
- Stop it, on the server: `systemctl disable --now actions.runner.PrototeamHQ-protobase.hetzner-{1..5}`. Delete the variable first, since pushes to `main` and `fm/**` wait for a runner that is offline.

## Release speed

`bun run release:speed` reports how fast releases are tested and built: for the `release` and `ci` workflows and each of their jobs, the p50, p90 and latest wall, queue and run time over the last successful runs, and whether the workflow's p50 meets its target, by how much. It reads the Actions API through `gh`, so locally it needs `gh auth login`. The `release-speed` workflow runs it daily and after each release run and writes the report to its job summary; it only reports, so it never holds up or fails a release.

The window and the targets are in `scripts/release-speed/config.json`: `window` is how many runs, and each workflow has `targetMinutes` for its p50 and the `event` and `branch` its runs are taken from. `ci` has no branch, since on `main` its checks run inside the release workflow, as its `check / ...` jobs; its own runs are the pushes to `fm/**` branches.
