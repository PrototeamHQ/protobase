// Which tests and steps a change affects, beyond what the module graph shows. Vitest finds the tests that import a
// changed module; these rules cover what it cannot see. Paths are globs from the repository's root.

// Files every test or step depends on: a change to one runs everything.
export const runEverything = [
  '**/package.json',
  'bun.lock',
  '**/bunfig.toml',
  '**/tsconfig*.json',
  '**/vitest.config.*',
  '**/vite.config.*',
  '.nvmrc',
  '.github/**',
  'docker-compose.yml',
  // The databases, snapshot recording and setup files the tests run with.
  'test-support/**',
  'scripts/test-db/**',
  // These rules and the scripts that apply them.
  'scripts/affected/**',
  'scripts/affected-*.mjs',
]

// Files that are no module and that no test reads.
export const readByNoTest = ['**/*.md', '**/*.mdx', '**/LICENSE', '**/.gitignore', '**/.env.example', '.githooks/**', 'docker/**', 'website/**', 'scripts/dom-snapshots/layouts/**', 'scripts/release-speed/config.json']

// Tests that run on every push, whatever it changed: the ERP built and served by the CLI, as on Node after the tests.
export const alwaysRun = ['tests/smoke/**']

// What a module uses without importing it, which the module graph cannot see. Each file `from` matches counts as changed
// when one of these changed:
// - `starts`: modules it runs as a process, through what they import. What the command it runs loads or reads by path,
//   such as the admin app `protobase build` bundles, counts only for a test that names it, so a change to the UI runs
//   the tests that build an app and not every test that starts the CLI.
// - `loads`: modules it loads or bundles by path, through what they import and what they use in turn.
// - `reads`: files it reads by path.
// A file that is no module and that no rule reads runs everything.
const cliModuleFiles = ['packages/cli/src/project/admin-app.ts', 'packages/cli/src/build/entry-code.ts', 'packages/cli/src/build/serve-runtime.ts', 'packages/cli/src/dev/run.ts']
const exampleDatabase = (example) => ({ from: [`tests/examples/${example}/**`], reads: [`examples/${example}/db/migrations/**`, `examples/${example}/seed/**`] })

export const edges = [
  // The CLI's tests start the CLI from source in the ERP, or in a project beside it.
  { from: ['packages/cli/tests/support/auth-project.ts'], starts: ['packages/cli/bin/protobase-source.mjs', 'examples/erp/protobase.config.ts'], reads: ['examples/erp/**'] },
  // Those that build, serve or develop the ERP, with its UI.
  { from: ['tests/smoke/erp-bundle.test.ts', 'packages/cli/tests/dev/dev.integration.test.ts'], loads: [...cliModuleFiles, 'examples/erp/protobase.ui.tsx'] },
  // The admin app, found by @protobase/ui's path, which a build bundles and checks a theme against.
  { from: ['packages/cli/src/project/admin-app.ts'], loads: ['packages/ui/src/app/main.tsx'], reads: ['packages/ui/**'] },
  // Modules the CLI loads by path (module-file.ts).
  { from: ['packages/cli/src/build/entry-code.ts'], loads: ['packages/cli/src/project/convention.ts'] },
  { from: ['packages/cli/src/build/serve-runtime.ts'], loads: ['packages/cli/src/serve/main.ts'] },
  { from: ['packages/cli/src/dev/run.ts'], loads: ['packages/cli/src/dev/entry.ts'] },
  // A deploy bundle copies the @protobase packages.
  { from: ['packages/cli/src/build/packages/copy-packages.ts'], reads: ['packages/**'] },
  // The UI's tests of its stylesheet and page, and the auth schema a server test upgrades.
  { from: ['packages/ui/src/tokens.test.ts'], reads: ['packages/ui/src/tokens.css'] },
  { from: ['packages/ui/src/app/index-html.test.ts', 'packages/ui/src/theme/theme-preference.test.ts'], reads: ['packages/ui/src/app/index.html'] },
  { from: ['packages/server/tests/auth-snake-case.test.ts'], reads: ['packages/server/tests/support/*.sql'] },
  // The examples' tests run on a clone of a template database, migrated and seeded from the example.
  exampleDatabase('erp'),
  exampleDatabase('real-estate'),
  exampleDatabase('property-portal'),
  // The snapshot tests replay the recording next to them.
  { from: ['packages/*/tests/**/*.test.ts', 'tests/**/*.test.ts'], reads: ['**/*.sql.json'] },
  // The browser clients the e2e tests bundle.
  { from: ['tests/e2e/support/bundle-client.ts'], loads: ['tests/e2e/support/browser-client.ts', 'tests/e2e/support/sources-client.ts'] },
  // The release scripts the release tests run.
  { from: ['tests/release/release.test.ts'], starts: ['scripts/release.mjs'], reads: ['.versionrc.json'] },
  { from: ['tests/release/publish-pack.test.ts'], starts: ['scripts/publish.mjs'] },
  // The API reference check, TypeDoc on the schema's entry point with the website's options and link plugin.
  { from: ['tests/docs/api-check.test.ts'], loads: ['packages/schema/src/index.ts', 'website/typedoc-doc-pages.mjs'], reads: ['website/typedoc*.json'] },
]

// The documentation site and Storybook, which `bun run docs:build` builds and the play tests, layout snapshots and
// `bun run docs:check` check: the stories and what they import, the stylesheets, whose own imports the module graph
// does not show, the schema API reference, the site's pages and the example code they show, the protobase skill it
// serves, and the scripts that check them.
export const site = {
  loads: ['packages/*/src/**/*.stories.tsx', '.storybook/*', 'packages/schema/src/index.ts'],
  reads: ['packages/**/*.css', 'website/**', 'skills/**', 'docs-examples/**', 'examples/erp/config/**', 'scripts/dom-snapshots/**', 'scripts/lib/**', 'scripts/{play-tests,dom-snapshots,check-docs,static-server}.mjs'],
}

// The Postgres suite (`bun run test:postgres`, tests/postgres), which CI runs when a file it depends on changed: the SQL
// the server and the query layer issue, the jobs and changes schemas and the auth store with them, the examples'
// migrations and seeds, and the suite with what it runs. A file every test depends on, such as the Postgres service
// image in ci.yml, docker-compose.yml or scripts/test-db/, runs it too.
export const postgresSuite = [
  'packages/server/src/**',
  'packages/query/src/**',
  'examples/*/db/migrations/**',
  'examples/*/seed/**',
  'tests/postgres/**',
  'tests/jobs/**',
  'tests/changes/{delivery-*,capture-scenarios}.ts',
  'tests/changes/receiver.ts',
  'tests/examples/erp/{erp-models,kysely-postgres-js,reachable}.ts',
]

// What the snapshot tests' recordings (`bun run test:record`, `*.sql.json`) are made from, which CI records again when a
// file of it changed: the SQL the server and the query layer issue, with the jobs, changes and auth schemas in it, the
// tests with their recordings, and the Postgres setup. A file every test depends on, such as test-support/, the
// Postgres service image in ci.yml, docker-compose.yml or scripts/test-db/, records them too.
export const snapshotRecording = [
  'packages/server/src/**',
  'packages/query/src/**',
  'packages/*/tests/**',
  'tests/{ai,changes,comments,import,roles}/**',
  'examples/*/db/migrations/**',
  'examples/*/seed/**',
]
