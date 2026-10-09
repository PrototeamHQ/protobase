// Modules the serve runtime hands to a config bundle, so the bundle and the runtime share one copy of each:
// `protobase build` leaves them as imports and the runtime supplies them (see host-modules.ts). Besides the server
// entry points of the @protobase packages, the main entry of every dependency they run on the server, and kysely's
// Postgres helpers.
export const hostModuleIds = [
  '@protobase/schema',
  '@protobase/layout',
  '@protobase/layout/jsx-runtime',
  '@protobase/query',
  '@protobase/server',
  'kysely',
  'kysely/helpers/postgres',
  'pg',
  'postgres',
  'better-auth',
  'hono',
  'jose',
  'zod',
  'aip-parsers',
  '@hono/node-server',
  '@scalar/hono-api-reference',
] as const

export type HostModuleId = (typeof hostModuleIds)[number]
