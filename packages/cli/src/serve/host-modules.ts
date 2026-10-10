import * as nodeServer from '@hono/node-server'
import * as apiReference from '@scalar/hono-api-reference'
import * as aipParsers from 'aip-parsers'
import * as betterAuth from 'better-auth'
import * as hono from 'hono'
import * as honoCors from 'hono/cors'
import * as honoHttpException from 'hono/http-exception'
import * as honoValidator from 'hono/validator'
import * as jose from 'jose'
import * as kysely from 'kysely'
import * as kyselyPostgres from 'kysely/helpers/postgres'
import * as pg from 'pg'
import * as postgres from 'postgres'
import * as zod from 'zod'
import * as layout from '@protobase/layout'
import * as query from '@protobase/query'
import * as schema from '@protobase/schema'
import * as server from '@protobase/server'
import type { HostModuleId } from './host-module-ids'

const hostModules: Record<HostModuleId, Record<string, unknown>> = {
  '@protobase/schema': schema,
  '@protobase/layout': layout,
  '@protobase/layout/jsx-runtime': layout.jsxRuntime,
  '@protobase/query': query,
  '@protobase/server': server,
  kysely,
  'kysely/helpers/postgres': kyselyPostgres,
  pg,
  postgres,
  'better-auth': betterAuth,
  hono,
  'hono/cors': honoCors,
  'hono/http-exception': honoHttpException,
  'hono/validator': honoValidator,
  jose,
  zod,
  'aip-parsers': aipParsers,
  '@hono/node-server': nodeServer,
  '@scalar/hono-api-reference': apiReference,
}

type ModuleLoader = () => { exports: Record<string, unknown>; loader: 'object' }
type BunRuntime = { plugin(plugin: { name: string; setup(build: { module(id: string, load: ModuleLoader): void }): void }): void }

// Under Bun, a bundle's imports of the host modules resolve to the runtime's own copies, with no node_modules
// anywhere (Bun's virtual modules). Under Node, as in `protobase serve`, they resolve from the project's node_modules.
export const provideHostModules = () => {
  const bun = (globalThis as { Bun?: BunRuntime }).Bun
  if (!bun) return
  bun.plugin({
    name: 'protobase-host-modules',
    setup: (build) => {
      for (const [id, exports] of Object.entries(hostModules)) build.module(id, () => ({ exports, loader: 'object' }))
    },
  })
}
