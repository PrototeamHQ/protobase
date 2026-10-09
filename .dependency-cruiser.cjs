// Tests, stories and their fixtures, which may use the workspace's dev dependencies.
const testCode = ['\\.test\\.tsx?$', '\\.stories\\.tsx$', '^packages/[^/]+/tests/', '^packages/layout/src/testing/', '^packages/ui/src/app/testing/']

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
      name: 'cli-imports',
      comment: '@protobase/cli imports only schema, layout, query, server and ui.',
      severity: 'error',
      from: { path: '^packages/cli/' },
      to: { path: '^packages/', pathNot: '^packages/(cli|schema|layout|query|server|ui)/' },
    },
    {
      name: 'packages-through-entry-points',
      comment: 'A package imports another only by its @protobase name, never by a path into its source.',
      severity: 'error',
      from: { path: '^packages/([^/]+)/' },
      to: { path: '^packages/', pathNot: '^packages/$1/', dependencyTypes: ['local'] },
    },
    {
      name: 'declared-dependencies',
      comment: 'A package imports only what its package.json lists in dependencies, so it installs and works on its own. The rules above keep its @protobase imports to the ones it lists.',
      severity: 'error',
      from: { path: '^packages/', pathNot: testCode },
      to: { dependencyTypes: ['npm-no-pkg', 'npm-unknown', 'npm-dev'] },
    },
    {
      name: 'examples-use-entry-points',
      comment: 'Examples, the ERP and the documentation\'s, their tests and the shared test support import @protobase packages by name, never by path.',
      severity: 'error',
      from: { path: '^(examples|docs-examples|tests/examples|test-support)/' },
      to: { path: '^packages/', dependencyTypes: ['local'] },
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
    tsConfig: { fileName: 'tsconfig.json' },
    tsPreCompilationDeps: true,
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'require', 'node', 'default'],
    },
  },
}
