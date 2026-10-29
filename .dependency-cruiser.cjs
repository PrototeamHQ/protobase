// Tests, stories and their fixtures, which may use the workspace's dev dependencies.
const testCode = ['\\.test\\.tsx?$', '\\.stories\\.tsx$', '^packages/[^/]+/tests/', '^packages/layout/src/testing/', '^packages/ui/src/app/testing/', '^packages/server/src/notifications/testing/']
// The CLI refuses mobile.plugins that @protobase/mobile pins, read from its package.json at build time: a manifest, not
// source, and inlined, so installing the CLI never installs Capacitor (packages/cli/src/mobile/pinned-packages.ts).
const mobilePins = '^packages/mobile/package\\.json$'

/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: 'schema-runs-anywhere',
      comment: '@protobase/schema imports no other @protobase package.',
      severity: 'error',
      from: { path: '^packages/schema/' },
      to: { path: '^packages/', pathNot: '^packages/schema/' },
    },
    {
      name: 'layout-runs-anywhere',
      comment: '@protobase/layout imports only schema: layouts are built in the config, checked on the server and rendered in the browser.',
      severity: 'error',
      from: { path: '^packages/layout/' },
      to: { path: '^packages/', pathNot: '^packages/(layout|schema)/' },
    },
    {
      name: 'query-server-only',
      comment: '@protobase/query imports only schema.',
      severity: 'error',
      from: { path: '^packages/query/' },
      to: { path: '^packages/', pathNot: '^packages/(query|schema)/' },
    },
    {
      name: 'client-runs-anywhere',
      comment: '@protobase/client imports only schema and layout.',
      severity: 'error',
      from: { path: '^packages/client/' },
      to: { path: '^packages/', pathNot: '^packages/(client|schema|layout)/' },
    },
    {
      name: 'ui-browser-only',
      comment: '@protobase/ui imports only schema, layout and client: never query, server or cli.',
      severity: 'error',
      from: { path: '^packages/ui/' },
      to: { path: '^packages/', pathNot: '^packages/(ui|schema|layout|client)/' },
    },
    {
      name: 'server-imports',
      comment: '@protobase/server imports only schema, layout and query.',
      severity: 'error',
      from: { path: '^packages/server/' },
      to: { path: '^packages/', pathNot: '^packages/(server|schema|layout|query)/' },
    },
    {
      name: 'config-types-only',
      comment: '@protobase/config runs nothing besides defineConfig: reading a config loads it and the config alone, so it imports types only.',
      severity: 'error',
      from: { path: '^packages/config/src/', pathNot: testCode },
      to: { pathNot: '^packages/config/', dependencyTypesNot: ['type-only'] },
    },
    {
      name: 'cli-imports',
      comment: '@protobase/cli imports only config, schema, layout, query, server and ui, and the pins in @protobase/mobile\'s package.json, which its build inlines.',
      severity: 'error',
      from: { path: '^packages/cli/' },
      to: { path: '^packages/', pathNot: ['^packages/(cli|config|schema|layout|query|server|ui)/', mobilePins] },
    },
    {
      name: 'packages-through-entry-points',
      comment: 'A package imports another only by its @protobase name, never by a path into its source.',
      severity: 'error',
      from: { path: '^packages/([^/]+)/' },
      to: { path: '^packages/', pathNot: ['^packages/$1/', mobilePins], dependencyTypes: ['local'] },
    },
    {
      name: 'declared-dependencies',
      comment: 'A package imports only what its package.json lists in dependencies, so it installs and works on its own. The rules above keep its @protobase imports to the ones it lists.',
      severity: 'error',
      // The source bin runs only in this repository, which installs its devDependencies.
      from: { path: '^packages/', pathNot: [...testCode, '^packages/cli/bin/protobase-source\\.mjs$'] },
      to: { dependencyTypes: ['npm-no-pkg', 'npm-unknown', 'npm-dev'] },
    },
    {
      name: 'examples-use-entry-points',
      comment: 'Examples, the ERP and the documentation\'s, their tests and the shared test support import @protobase packages by name, never by path.',
      severity: 'error',
      from: { path: '^(tests/apps|docs-examples|tests/examples|test-support)/' },
      to: { path: '^packages/', dependencyTypes: ['local'], dependencyTypesNot: ['aliased-workspace'] },
    },
    {
      name: 'decrypt-in-reveal-only',
      comment: 'Encrypted fields are decrypted only by their reveal, the audited decryptField of jobs and functions, and the encryption status and apply commands.',
      severity: 'error',
      from: { pathNot: [...testCode, '^packages/server/src/(reveal-service|encryption/decrypt-field|encryption/status|encryption/apply)\\.ts$'] },
      to: { path: '^packages/server/src/encryption/envelope-open\\.ts$' },
    },
    {
      name: 'no-circular',
      severity: 'error',
      from: {},
      to: { circular: true },
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    // The packages' build output and build configs, which are not package code.
    exclude: { path: ['^packages/[^/]+/dist/', '^packages/[^/]+/tsdown\\.config\\.ts$'] },
    tsConfig: { fileName: 'tsconfig.json' },
    tsPreCompilationDeps: true,
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'require', 'node', 'default'],
    },
  },
}
