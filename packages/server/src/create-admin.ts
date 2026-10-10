import { Hono } from 'hono'
import { checkPages } from '@protobase/layout'
import type { Db } from '@protobase/query'
import type { UserMenuSource } from '@protobase/schema'
import { assistantSettings } from './assistant/assistant-settings'
import { builtInAssistant } from './assistant/built-in-assistant'
import { assistantRecords } from './assistant/records'
import { consoleAuditQueue } from './audit/console-queue'
import { authBasePath, type AdminAuth } from './better-auth/create-auth'
import { organizationRoutes } from './better-auth/organizations/admin-routes'
import { statusRoute } from './better-auth/status-route'
import { checkShell } from './check-shell'
import { checkViews } from './check-views'
import { createErrorHandler } from './error-handler'
import { createMeta } from './meta'
import { buildRegistry } from './registry'
import type { ResourceSource } from './resource-source'
import { batchRoute } from './routes/batch'
import { collectionRoutes } from './routes/collection'
import { docsRoutes } from './routes/docs'
import { metaRoutes } from './routes/meta'
import { recordRoutes } from './routes/record'
import { runtimeUrl } from './runtime/runtime-settings'
import { createScanGuard } from './scan-guard'
import type { AdminOptions } from './admin-options'
import type { AdminEnv, Authenticator, PageSource, Session, ViewSource } from './types'

export type CreateAdminInput = {
  resources: ResourceSource[]
  views?: ViewSource[]
  /** The `userMenu(...)` export of the config module: pages under the signed-in user in the sidebar. */
  userMenu?: UserMenuSource
  /** Composed pages (`page()` from @protobase/layout), served by /meta and checked against the resources here. */
  pages?: PageSource[]
  db: Db
  authenticate: Authenticator
  /** A Better Auth instance (see `createAuth`): its handler is mounted at `/api/auth`. */
  auth?: AdminAuth
  options?: AdminOptions
}

/** The admin REST API as a Hono app. It uses only Web APIs, so it runs on Node, Workers and anywhere else Hono does. */
export const createAdmin = ({ resources, views = [], pages = [], userMenu, db, authenticate, auth, options = {} }: CreateAdminInput) => {
  const basePath = options.basePath ?? '/api/v1'
  const registry = buildRegistry(resources)
  const viewModels = views.map((view) => view.toModel())
  const userMenuModel = userMenu?.toUserMenuModel()
  const pageModels = pages.map((entry) => entry.toModel())
  checkShell(registry, viewModels, userMenuModel, pageModels.map((entry) => entry.name))
  checkViews(registry, viewModels)
  checkPages(pageModels, {
    models: Object.fromEntries(registry.entries.map((entry) => [entry.name, entry.model])),
    actions: (resource) => new Set(viewModels.filter((view) => view.resource === resource).flatMap((view) => view.actions.map((action) => action.name))),
  })
  const systemPath = basePath.slice(0, basePath.lastIndexOf('/'))
  const assistant = assistantSettings(options.assistant, globalThis.process?.env ?? {})
  const runtime = runtimeUrl(options.runtime, globalThis.process?.env ?? {})
  const deps = {
    db,
    registry,
    views: viewModels,
    pages: pageModels,
    ...(userMenuModel && { userMenu: userMenuModel }),
    basePath,
    systemPath,
    statementTimeoutMs: options.statementTimeoutMs ?? 15_000,
    guard: createScanGuard(db, options.scanGuard),
    hooks: options.writeHooks ?? [],
    audit: options.audit ?? consoleAuditQueue(),
    accessOptions: { ...(options.roles && { roles: options.roles }), ...(options.defaultAccess && { defaultAccess: options.defaultAccess }) },
    rowPermissions: (resource: string) => (typeof options.rowPermissions === 'object' ? !options.rowPermissions.except.includes(resource) : options.rowPermissions !== false),
    ...(assistant && { assistant: assistant.kind === 'external' ? assistant.url : `${systemPath}/assistant` }),
    ...(runtime && { runtime }),
  }

  const meta = createMeta(deps)
  const onError = createErrorHandler(options.onUnhandledError)
  // Every response of the resources API and of the system endpoints names the models version; every request needs a token.
  const guarded = (routes: (app: Hono<AdminEnv>) => void) => {
    const app = new Hono<AdminEnv>()
    app.onError(onError)
    app.use('*', async (c, next) => {
      await next()
      c.res.headers.set('X-Meta-Version', await meta.version(c.get('session')?.user.roles ?? []))
    })
    app.use('*', async (c, next) => {
      c.set('session', await authenticate(c.req.raw))
      await next()
    })
    routes(app)
    return app
  }
  // `/api/v1/*` is only resources, so a table may be called `meta` or `docs`; the system endpoints live beside it.
  const api = guarded((app) => {
    app.route('/', collectionRoutes(deps))
    app.route('/', recordRoutes(deps))
  })
  const system = guarded((app) => {
    app.route('/', docsRoutes(deps))
    app.route('/', metaRoutes(meta))
  })

  const app = new Hono<AdminEnv>()
  app.onError(onError)
  if (auth) {
    app.route(authBasePath, statusRoute(auth))
    if (auth.organizations) app.route(authBasePath, organizationRoutes({ auth, audit: deps.audit, registry, db }))
    app.on(['GET', 'POST'], `${authBasePath}/*`, (c) => auth.handler(c.req.raw))
  }
  if (assistant?.kind === 'built-in') {
    const tools = options.assistant ? options.assistant.tools : undefined
    const records = (session: Session) => assistantRecords(deps, session)
    app.route(`${systemPath}/assistant`, builtInAssistant({ model: assistant.model, chats: assistant.chats, db, meta, authenticate, tools, records, report: options.onUnhandledError }))
  }
  app.route('/', batchRoute(deps, authenticate, meta))
  app.route(basePath, api)
  app.route(deps.systemPath || '/', system)
  return app
}
