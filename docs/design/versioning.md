# Version management

How a project chooses the Protobase it runs on, and how that version moves locally, in CI and on Protobase Cloud. This is a design document: it records the decided model and marks what is built today and what is planned. The user-facing pages (`docs/website/src/content/docs/reference/versioning.md`, `reference/cli.md`) describe only what is built.

The facts about today are those of Protobase 0.49.2 and Protobase Cloud's matching release. Release timing, including when 1.0 is cut, is out of scope.

## Motivation

- **Most of a project's install is the CLI.** `@protobase/cli` depends on every `@protobase` package plus Vite, lightningcss and the UI's map and chart libraries: about 276 packages and 430 MB. A project's `node_modules` is mostly framework it never imports.
- **The runtime already supplies the framework.** `protobase build` leaves every `@protobase` package and its main dependencies (`kysely`, `pg`, `react`, ...) out of the bundle, and the serve runtime of `manifest.protobase` provides them. The versions a project installs matter only for dev, the build, scripts and editor types.
- **Updates should not need a commit.** When the CLI carries the framework, a new CLI brings fixes to dev and the next build with no change to the project. Today every update moves the lockfile, by hand, by a bot or by Cloud's update job.
- **Apps keep up before 1.0.** The standing rule is to move every app to each new Protobase version promptly while Protobase is below 1.0, so an update has to be cheap and safe to take.
- **Some apps must not move.** A project that needs exactly one version has to be able to say so in package.json, and get exactly that everywhere.
- **One rule.** Today the CLI, Cloud and the templates each compare versions their own way. Versions follow [semver](https://semver.org), and every comparison is made with the `semver` library; Protobase adds no rules of its own.

## The model

### Where `@protobase` packages are listed decides whose copies run

| package.json | Mode | Copies used by dev, build and scripts | `manifest.protobase` |
| --- | --- | --- | --- |
| `@protobase/*` in `devDependencies` | **bundled** (recommended) | the CLI's own | the CLI's version |
| `@protobase/*` in `dependencies` | **locked** | the project's installed copies | the installed version |
| no `@protobase/*`, or no package.json | bundled | the CLI's own | the CLI's version |

- The listing states the project's Protobase version either way. The CLI's startup check uses semver to test its own version against it, and refuses to run otherwise.
- Every listed `@protobase` package must carry exactly the same version specifier. The packages are released together and pass values to each other, so a project never mixes two versions. A mismatch is an error naming the package.

### Third-party packages

- `dependencies` holds only packages the project's own code uses at runtime.
- Packages the runtime supplies, such as React, may be listed in `devDependencies` for their types. In a bundle the runtime's copy runs whatever the project installed.

### A config with no package.json

`protobase.config.ts` or `protobase.config.json` alone is a project, and so is a folder with no config file, which is a config of defaults. It loads with the CLI's versions, as in bundled mode.

The config is one object of data. A `protobase.config.ts` imports only `defineConfig` from `@protobase/config`, which imports types only, and a `protobase.config.json` imports nothing. The project's code (jobs, hooks, functions) is found by its path, not imported by the config.

### Where the server runs

- **`protobase dev`** runs the API in a process of its own. It loads the project's `@protobase/server` when the project is locked, and the CLI's otherwise. The CLI's process never loads the server.
- **Builds** (`protobase build` and the commands that check the config) load the server in the CLI's process, from the copy the mode selects.

### Editor types

The CLI writes `.protobase/tsconfig.json`, gitignored, whose `paths` point the `@protobase` packages and the runtime-supplied packages at the CLI's own install, by name. The project's `tsconfig.json` extends it. Types then match the CLI that builds the app, with nothing installed in the project. `@types/react` and `@types/node` stay the project's own devDependencies, because the CLI does not carry them.

A smarter tsconfig that a project can extend in more ways is a stretch idea, not part of this design.

### Protobase Cloud

- **Build.** Cloud builds every app with the newest CLI of the app's major, in the newest `protobase-dev` image. A locked app's own installed packages are used, as locally.
- **Runtime.** Each app's runtime is pinned to its bundle's `manifest.protobase`.
- **Lockfile.** Only Cloud's automatic update moves an app's lockfile. A build never changes it.
- **Updates.** The automatic update runs pre-flight then switch: it pins the app's `@protobase` packages to the release in its lockfile, checks the change (migrations and `protobase doctor` in a dry run) and commits it, then migrates and moves the app's route to the release.
- **Rebuilds.** The automatic update rebuilds an app only when its bundle carries customizations built against a version. Which customizations count is scoped separately.

### Templates

- A template lists its `@protobase` packages in `devDependencies`, so a new project is bundled.
- Its specifier is locked to the template's minor.
- A GitHub Action in each template repository bumps the specifier when a release comes out, and merges the change once CI is green.

## Workflows

### New project

1. `npm create protobase` (or `bun create protobase`) writes a template: `@protobase/*` in `devDependencies` at the template's specifier, and a `tsconfig.json` that extends `.protobase/tsconfig.json`.
2. `bun install` installs the project's own packages and type definitions.
3. `protobase dev` checks the CLI against the specifier, writes `.protobase/tsconfig.json`, and runs the API with the CLI's server.
4. `protobase build` writes the CLI's version into `manifest.protobase`.

### Update within the specifier

1. Install a newer CLI (the global one, or the project's `@protobase/cli` dev dependency).
2. The startup check passes as long as semver says the new version satisfies the project's specifier.
3. Dev and the next build use the new version. The project's files and lockfile do not change; the next bundle names the new version.

An update outside the specifier is a change to the specifier, made by hand, by a bot, or by Cloud's automatic update.

### Fully locked project

1. Move every `@protobase` package to `dependencies` at one exact version, and `bun install`.
2. Dev, the build and scripts use the installed copies; dev's API process loads the installed server.
3. `manifest.protobase` is that version, and Cloud serves exactly it.
4. The version moves only when the specifier and lockfile are changed.

### Config with no package.json

1. Run `protobase dev` or `protobase build` next to `protobase.config.ts`.
2. Everything comes from the CLI: the server, the shell and the editor types from `.protobase/tsconfig.json`.
3. The bundle names the CLI's version.

### Dev

1. The CLI reads package.json: the mode, the specifier and the check that every `@protobase` package has the same one.
2. The startup check tests the CLI's version against the specifier with semver.
3. Vite serves the CLI's admin app; the API starts in a child process with the server the mode selects.
4. `.protobase/tsconfig.json` is refreshed.

### Cloud build and runtime

1. A push triggers a build in the newest `protobase-dev` image with the newest CLI of the app's major.
2. The job installs the lockfile frozen (none to install for a project without package.json) and runs `protobase build`.
3. The bundle's `manifest.protobase` pins the app's runtime.
4. When a new release is due under the app's update policy, the update job pins the `@protobase` packages to it in the lockfile, pre-flights the change, commits it, migrates and switches the route.
5. It rebuilds only an app with bundle-level customizations.

### Template bump

1. A Protobase release is published.
2. The template repository's GitHub Action opens a change that moves the template's specifier.
3. The template's CI runs against the new version.
4. When CI is green the Action merges it; when it fails the change stays open for a person.

## Implemented today and planned

| Part | Today | Planned |
| --- | --- | --- |
| Semver comparisons | Built: the startup check, plugin ranges, shell versions, release tags and preset ranges use the `semver` library. | |
| Startup check | Built (`packages/cli/src/version/project-version.ts`): the CLI's version must satisfy the specifier package.json lists every `@protobase` package at, the same for all of them; a locked project's installed copies must also be in the caret range of the CLI's version. | |
| devDependencies vs dependencies | Built (`packages/cli/src/version/project-packages.ts`): bundled for `devDependencies` or no listing, locked for `dependencies`. | |
| Dev in its own process | Built (`packages/cli/src/dev/server-package.ts`): the project's server only when locked; a bundled project's files, API and page get the CLI's copies (`packages/cli/src/project/bundled-imports.ts`). | |
| Build without an install | Built: a bundled project's files load with the CLI's copies, and its UI plugin builds against the CLI's `@protobase/ui` (`packages/cli/src/build/plugin-build.ts`). A locked project still needs its install. | |
| `manifest.protobase` | Built: the version of the copies the mode selects (`bundleProtobaseVersion`). | |
| `.protobase/tsconfig.json` | Built: `protobase types` writes it, and so do `dev`, `build` and every command that loads the project's config (`packages/cli/src/project/project-types.ts`). | |
| Scripts | Built: `protobase run <file>` runs a script under Bun, with a bundled project's imports preloaded from the CLI (`packages/cli/src/run`). | Tests: vitest does not reach the CLI's copies yet. |
| Hand-over | Built: a CLI hands a locked project over to the `@protobase/cli` it installed (`packages/cli/src/hand-over.ts`). | `@protobase/cli/runner` does not hand over. |
| `protobase-dev` image | Built: the release's CLI installed globally, in `/opt/protobase/cli`. | |
| Templates | Built: `@protobase/*` in `devDependencies` at the caret range of the release, `tsconfig.json` extending `.protobase/tsconfig.json`, scripts through `protobase run` (`packages/presets`, written from `tests/apps`, whose examples stay locked to the workspace). | Bumped by a GitHub Action in each template repository. |
| Cloud build | Runs the CLI of the release the app's lockfile pins, in that release's job image, built first when the host has none. | The newest CLI of the app's major, in the newest `protobase-dev` image. |
| Cloud runtime | Built: exactly the release the lockfile pins, as `manifest.protobase` names it. | Unchanged. |
| Cloud lockfile and updates | Built: only the update job moves the lockfile, pre-flight then switch. New apps' policy is `immediate`. | Unchanged. |
| Cloud rebuilds | None on update, except demo apps; an app whose owner uploads its bundles has its update skipped. | Only for apps with bundle-level customizations (scoped separately). |

### Open questions for the implementation tasks

- How tests (vitest) reach the CLI's copies in a bundled project with nothing installed. Scripts do, through `protobase run`.
- Where Cloud gets the newest CLI of a major: jobs run the job image of one exact release, and the images carry only exact version tags.
