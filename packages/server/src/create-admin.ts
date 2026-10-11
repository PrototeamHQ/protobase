import { Hono } from 'hono'
import { checkPages } from '@protobase/layout'
import type { Db } from '@protobase/query'
import type { BottomBarSource, UserMenuSource } from '@protobase/schema'
import { assistantSettings } from './assistant/assistant-settings'
import { builtInAssistant } from './assistant/built-in-assistant'
import { assistantRecords } from './assistant/records'
import { consoleAuditQueue } from './audit/console-queue'
import { authBasePath, type AdminAuth } from './better-auth/create-auth'
import { organizationRoutes } from './better-auth/organizations/admin-routes'
import { statusRoute } from './better-auth/status-route'
import { changesSchema, type EventsOptions } from './changes/events-options'
import { createWebhooks } from './webhooks/webhooks'
import { webhookTable } from './webhooks/table/webhook-table'
import { subscriptionWriteCheck } from './webhooks/table/validate-hook'
import type { WebhooksOptions } from './webhooks/table/options'
import type { SubscriptionDefinition } from './webhooks/subscription'
import { checkBottomBars, checkShell } from './check-shell'
import { checkViews } from './check-views'
import { createErrorHandler } from './error-handler'
import type { FilesOptions } from './files/options'
import { fileRoutes } from './files/routes'
import { createFilesRuntime } from './files/runtime'
import { toApiFunction, type FunctionSource } from './functions/define-function'
import { callerRecords } from './functions/records'
import { functionRoutes } from './functions/routes'
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
import type { Admin, AdminEnv, Authenticator, PageSource, Session, ViewSource } from './types'
import { failedJobs, failedJobsView } from './jobs/failed-jobs'
import type { JobDefinition } from './jobs/job-types'

export type CreateAdminInput = {
  resources: ResourceSource[]
  views?: ViewSource[]
  /** The `userMenu(...)` export of the config module: pages under the signed-in user in the sidebar. */
  userMenu?: UserMenuSource
  /** The `bottomBar(...)` exports of the config module, in order: tabs on phones for the roles each names. */
  bottomBars?: BottomBarSource[]
  /** Composed pages (`page()` from @protobase/layout), served by /meta and checked against the resources here. */
  pages?: PageSource[]
  db: Db
  authenticate: Authenticator
  /** A Better Auth instance (see `createAuth`): its handler is mounted at `/api/auth`. */
  auth?: AdminAuth
  /** API functions of the app's own, each served at `<systemPath>/functions/<name>` (see `defineFunction`). */
  functions?: Record<string, FunctionSource>
  /** Where file fields keep their bytes (see `FilesOptions`). */
  files?: FilesOptions
  /** Where the changes that resources' events are raised from are captured (see `EventsOptions`). */
  events?: EventsOptions
  /** The app's jobs (see `defineJob`): with any, or a resource with events, admins get the failed jobs page (`failedJobs`). */
  jobs?: JobDefinition[]
  /** Where the resources' events are delivered (`subscription(...)` exports of the config module). */
  subscriptions?: SubscriptionDefinition[]
  /** Webhook subscriptions made in the admin app, from `extends: [webhooks()]` (see `WebhooksOptions`). */
  webhooks?: WebhooksOptions
  options?: AdminOptions
}

// The roles a user can hold, from the auth instance and `defineRoles`; unknown when the app declares neither.
const declaredRoles = (auth: AdminAuth | undefined, roles: AdminOptions['roles']) => {
  const names = [...(auth?.roles ?? []), ...Object.keys(roles?.definitions ?? {})]
  return names.length > 0 ? [...new Set(names)] : undefined
}

/** The admin REST API as a Hono app. It uses only Web APIs, so it runs on Node, Workers and anywhere else Hono does. */
export const createAdmin = ({ resources: appResources, views: appViews = [], pages = [], userMenu, bottomBars = [], db, authenticate, auth, functions = {}, files: filesOptions, events, jobs = [], subscriptions = [], webhooks: webhooksOptions, options = {} }: CreateAdminInput): Admin => {
  const basePath = options.basePath ?? '/api/v1'
  // Events are delivered by jobs, whose failures the page lists too.
  const withJobs = jobs.length > 0 || appResources.some((resource) => resource.toModel().events)
  const resources = withJobs ? [...appResources, failedJobs] : appResources
  const views = withJobs ? [...appViews, failedJobsView] : appViews
  const registry = buildRegistry(resources)
  const apiFunctions = Object.fromEntries(Object.entries(functions).map(([name, source]) => [name, toApiFunction(name, source)]))
  const viewModels = views.map((view) => view.toModel())
  const userMenuModel = userMenu?.toUserMenuModel()
  const pageModels = pages.map((entry) => entry.toModel())
  checkShell(registry, viewModels, userMenuModel, pageModels.map((entry) => entry.name))
  const bottomBarModels = bottomBars.map((bar) => bar.toBottomBarModel())
  checkBottomBars(registry, bottomBarModels, pageModels.map((entry) => entry.name), declaredRoles(auth, options.roles))
  checkViews(registry, viewModels)
  checkPages(pageModels, {
    models: Object.fromEntries(registry.entries.map((entry) => [entry.name, entry.model])),
    actions: (resource) => new Set(viewModels.filter((view) => view.resource === resource).flatMap((view) => view.actions.map((action) => action.name))),
  })
  const systemPath = basePath.slice(0, basePath.lastIndexOf('/'))
  const assistant = assistantSettings(options.assistant, globalThis.process?.env ?? {})
  const runtime = runtimeUrl(options.runtime, globalThis.process?.env ?? {})
  const files = createFilesRuntime({ ...(filesOptions && { options: filesOptions }), env: globalThis.process?.env ?? {}, models: registry.entries.map((entry) => entry.model), systemPath })
  const table = webhooksOptions && webhookTable(webhooksOptions, auth)
  const deps = {
    db,
    registry,
    views: viewModels,
    pages: pageModels,
    ...(userMenuModel && { userMenu: userMenuModel }),
    bottomBars: bottomBarModels,
    basePath,
    systemPath,
    statementTimeoutMs: options.statementTimeoutMs ?? 15_000,
    guard: createScanGuard(db, options.scanGuard),
    hooks: [...(options.writeHooks ?? []), ...(table ? [subscriptionWriteCheck(registry.entries.map((entry) => entry.model), table.checkUrl)] : [])],
    audit: options.audit ?? consoleAuditQueue(),
    accessOptions: { ...(options.roles && { roles: options.roles }), ...(options.defaultAccess && { defaultAccess: options.defaultAccess }) },
    rowPermissions: (resource: string) => (typeof options.rowPermissions === 'object' ? !options.rowPermissions.except.includes(resource) : options.rowPermissions !== false),
    ...(assistant && { assistant: assistant.kind === 'external' ? assistant.url : `${systemPath}/assistant` }),
    ...(runtime && { runtime }),
    ...(files && { files }),
    ...(registry.entries.some((entry) => entry.model.events) && { actorSetting: `${changesSchema(events)}.actor` }),
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
  app.route('/', functionRoutes({ basePath: `${systemPath}/functions`, functions: apiFunctions, authenticate, db, records: (session) => callerRecords(deps, session), onError }))
  app.route('/', batchRoute(deps, authenticate, meta))
  app.route('/', fileRoutes(deps, authenticate))
  app.route(basePath, api)
  app.route(deps.systemPath || '/', system)
  const webhooks = createWebhooks({ deps, subscriptions, functions: apiFunctions, schema: changesSchema(events), log: (line) => console.log(line), ...(table && { table }) })
  return Object.assign(app, { jobs: webhooks.jobs })
}
