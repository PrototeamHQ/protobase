// Modules the serve runtime hands to a config bundle, so the bundle and the runtime share one copy of each:
// `protobase build` leaves them as imports and the runtime supplies them (see host-modules.ts). Besides the server
// entry points of the @protobase packages, the main entry of every dependency they run on the server, kysely's
// Postgres helpers, the Hono middleware an API function is likeliest to use, and React with React Email's renderer,
// which `defineEmail` renders an email's component with: one copy for the component and the renderer. Of them, the
// lazy ones load when a bundle first imports them, not when the runtime starts.
export const lazyHostModuleIds = ['@protobase/server/email'] as const

export const hostModuleIds = [
  '@protobase/config',
  '@protobase/schema',
  '@protobase/layout',
  '@protobase/layout/jsx-runtime',
  '@protobase/query',
  '@protobase/server',
  ...lazyHostModuleIds,
  'kysely',
  'kysely/helpers/postgres',
  'pg',
  'postgres',
  'better-auth',
  'hono',
  'hono/cors',
  'hono/http-exception',
  'hono/validator',
  'jose',
  'zod',
  'aip-parsers',
  '@hono/node-server',
  '@scalar/hono-api-reference',
  'react',
  'react/jsx-runtime',
  '@react-email/render',
] as const

export type HostModuleId = (typeof hostModuleIds)[number]

export type LazyHostModuleId = (typeof lazyHostModuleIds)[number]
