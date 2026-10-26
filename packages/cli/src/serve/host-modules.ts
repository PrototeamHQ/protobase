import * as nodeServer from '@hono/node-server'
import * as reactEmailRender from '@react-email/render'
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
import * as react from 'react'
import * as reactJsxRuntime from 'react/jsx-runtime'
import * as zod from 'zod'
import * as protobaseConfig from '@protobase/config'
import * as layout from '@protobase/layout'
import * as query from '@protobase/query'
import * as schema from '@protobase/schema'
import * as server from '@protobase/server'
import type { HostModuleId, LazyHostModuleId } from './host-module-ids'

const hostModules: Record<Exclude<HostModuleId, LazyHostModuleId>, Record<string, unknown>> = {
  '@protobase/config': protobaseConfig,
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
  react,
  'react/jsx-runtime': reactJsxRuntime,
  '@react-email/render': reactEmailRender,
}

// The email layout loads React Email's components, a fifth of a second, so only for a bundle that imports it. A dynamic
// import, so the runtime's single-file bundle carries it too.
const lazyHostModules: Record<LazyHostModuleId, () => Promise<Record<string, unknown>>> = {
  '@protobase/server/email': () => import('@protobase/server/email'),
}

type ModuleLoader = () => { exports: Record<string, unknown>; loader: 'object' } | Promise<{ exports: Record<string, unknown>; loader: 'object' }>
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
      for (const [id, load] of Object.entries(lazyHostModules)) build.module(id, async () => ({ exports: await load(), loader: 'object' }))
    },
  })
}
