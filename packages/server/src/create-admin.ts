import { Hono } from 'hono'
import { checkPages } from '@protobase/layout'
import type { Db } from '@protobase/query'
import type { BottomBarSource, UserMenuSource } from '@protobase/schema'
import { aiModel } from './ai/ai-model'
import { hasAiActions, hasAiFields } from './ai/ai-fields'
import { fillHook } from './ai/fill-hook'
import { fillJob } from './ai/fill-job'
import { assistantSettings } from './assistant/assistant-settings'
import { builtInAssistant } from './assistant/built-in-assistant'
import { assistantRecords } from './assistant/records'
import { consoleAuditQueue } from './audit/console-queue'
import { apiCors, readCorsOrigins } from './api-cors'
import { defaultAppName, readAppName } from './app-name'
import { authBasePath, type AdminAuth } from './better-auth/create-auth'
import { webauthnPath } from './better-auth/origins'
import { organizationRoutes } from './better-auth/organizations/admin-routes'
import { statusRoute } from './better-auth/status-route'
import { isCaptured } from './changes/capture-sql'
import { changesSchema, type EventsOptions } from './changes/events-options'
import { appOrigin } from './comments/app-origin'
import { betterAuthCommentUsers, type CommentUsers } from './comments/comment-users'
import { mentionJob } from './comments/mention-job'
import { commentsResource, commentsView } from './comments/record-comments'
import { activityResource, activityView } from './history/activity'
import { betterAuthActorNames } from './history/actor-names'
import { historyDays, type HistoryOptions } from './history/options'
import { pruneHistoryJob } from './history/prune-history'
import { createWebhooks } from './webhooks/webhooks'
import { webhookTable } from './webhooks/table/webhook-table'
import { subscriptionWriteCheck } from './webhooks/table/validate-hook'
import type { WebhooksOptions } from './webhooks/table/options'
import type { SubscriptionDefinition } from './webhooks/subscription'
import { visitorsBrowse, withAnonymous } from './anonymous'
import { checkBottomBars, checkShell } from './check-shell'
import { checkOwnerFields } from './check-owners'
import { checkRoleLimits } from './check-roles'
import { checkViews } from './check-views'
import { liveRoutes } from './live/live-route'
import { tableFeed } from './live/notice-feed'
import { visibleNotices } from './live/visible-notices'
import { createErrorHandler } from './error-handler'
import { errorReportingSettings } from './error-reporting/error-reporting-settings'
import type { FilesOptions } from './files/options'
import { fileRoutes } from './files/routes'
import type { Difficulty } from './forms/challenge'
import { formRoutes } from './forms/routes'
import { createFormsRuntime } from './forms/runtime'
import { createFilesRuntime } from './files/runtime'
import { toApiFunction, type FunctionSource } from './functions/define-function'
import { callerRecords } from './functions/records'
import { functionRoutes } from './functions/routes'
import { mapSettings } from './maps/map-settings'
import { createMeta } from './meta'
import { buildRegistry } from './registry'
import type { ResourceSource } from './resource-source'
import { batchRoute } from './routes/batch'
import { collectionRoutes } from './routes/collection'
import { docsRoutes } from './routes/docs'
import { metaRoutes } from './routes/meta'
import { recordRoutes } from './routes/record'
import { runtimeUrl } from './runtime/runtime-settings'
import { pluginOptions, pluginsBeforeSignIn } from './plugins/plugin-settings'
import { checkSourceNames, sourceOptions } from './sources/source-settings'
import { createScanGuard } from './scan-guard'
import type { AdminOptions } from './admin-options'
import type { Deps } from './deps'
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
  /** How long the history of resources with `.history()` is kept (see `HistoryOptions`). */
  history?: HistoryOptions
  /** The app's jobs (see `defineJob`): with any, or a resource with events, history or comments, admins get the failed jobs page (`failed_jobs`). */
  jobs?: JobDefinition[]
  /** Where the resources' events are delivered (`subscription(...)` exports of the config module). */
  subscriptions?: SubscriptionDefinition[]
  /** Webhook subscriptions made in the admin app, from `extends: [webhooks()]` (see `WebhooksOptions`). */
  webhooks?: WebhooksOptions
  /**
   * The plugins the app's bundle carries, as `protobase build` writes them: its protobase.ui.tsx and its extensions'
   * UI configs, each a plugin.json path on the app's origin. `/meta` names them to everyone, before any other plugin,
   * and `options.plugins: false` leaves them on: they are the app's own UI.
   */
  bundlePlugins?: string[]
  /**
   * The field types the app's plugins register, by name, with the storage types each shows, as `protobase build` reads
   * them from the bundle's plugins: a view showing a field with one of them that does not show its storage type stops
   * startup. A field type not listed here, such as a remote plugin's, is not checked.
   */
  fieldTypes?: Record<string, string[]>
  options?: AdminOptions
  /** @internal The proof-of-work range of public forms' bot checks, which tests make tiny. */
  formsDifficulty?: Difficulty
  /** @internal The users comments name, mention and mail, which tests fake; from `auth` otherwise. */
  commentUsers?: CommentUsers
}

// The roles a user can hold, from the auth instance and `defineRoles`; unknown when the app declares neither.
const declaredRoles = (auth: AdminAuth | undefined, roles: AdminOptions['roles']) => {
  const names = [...(auth?.roles ?? []), ...Object.keys(roles?.definitions ?? {})]
  return names.length > 0 ? [...new Set(names)] : undefined
}

/** The admin REST API as a Hono app. It uses only Web APIs, so it runs on Node, Workers and anywhere else Hono does. */
export const createAdmin = ({ resources: appResources, views: appViews = [], pages = [], userMenu, bottomBars = [], db, authenticate, auth, functions = {}, files: filesOptions, events, history: historyOptions, jobs = [], subscriptions = [], webhooks: webhooksOptions, bundlePlugins = [], fieldTypes = {}, options = {}, formsDifficulty, commentUsers: givenCommentUsers }: CreateAdminInput): Admin => {
  const basePath = options.basePath ?? '/api/v1'
  // Events are delivered, history kept, mentions mailed and AI fields filled by jobs, whose failures the page lists too.
  // Admins list the history as Activity and every comment as Comments.
  const appModels = appResources.map((resource) => resource.toModel())
  const withComments = appModels.some((model) => model.comments)
  const withAiFields = hasAiFields(appModels)
  const withJobs = jobs.length > 0 || appModels.some(isCaptured) || withComments || withAiFields
  const withHistory = appModels.some((model) => model.history)
  const changes = changesSchema(events)
  const days = historyDays(historyOptions)
  const resources = [
    ...appResources,
    ...(withJobs ? [failedJobs] : []),
    ...(withHistory ? [activityResource(changes, { tenant: appModels.some((model) => model.history && model.tenant) })] : []),
    ...(withComments ? [commentsResource({ tenant: appModels.some((model) => model.comments && model.tenant) })] : []),
  ]
  const views = [...appViews, ...(withJobs ? [failedJobsView] : []), ...(withHistory ? [activityView] : []), ...(withComments ? [commentsView] : [])]
  const commentUsers = withComments ? (givenCommentUsers ?? (auth && betterAuthCommentUsers(auth))) : undefined
  const mentions = withComments ? mentionJob(commentUsers, auth?.appName ?? readAppName(globalThis.process?.env ?? {}) ?? defaultAppName) : undefined
  const registry = buildRegistry(resources)
  const apiFunctions = Object.fromEntries(Object.entries(functions).map(([name, source]) => [name, toApiFunction(name, source)]))
  const viewModels = views.map((view) => view.toModel())
  const userMenuModel = userMenu?.toUserMenuModel()
  const pageModels = pages.map((entry) => entry.toModel())
  checkShell(registry, viewModels, userMenuModel, pageModels.map((entry) => entry.name))
  const bottomBarModels = bottomBars.map((bar) => bar.toBottomBarModel())
  checkBottomBars(registry, bottomBarModels, pageModels.map((entry) => entry.name), declaredRoles(auth, options.roles))
  checkViews(registry, viewModels, pageModels.map((entry) => entry.name), fieldTypes)
  checkRoleLimits(registry, options.roles?.limits ?? [])
  checkOwnerFields(registry, auth)
  checkPages(pageModels, {
    models: Object.fromEntries(registry.entries.map((entry) => [entry.name, entry.model])),
    actions: (resource) => new Set(viewModels.filter((view) => view.resource === resource).flatMap((view) => view.actions.map((action) => action.name))),
    createPages: new Set(viewModels.filter((view) => view.create).map((view) => view.resource)),
  })
  const forms = createFormsRuntime({ registry, views: viewModels, limits: options.roles?.limits ?? [], env: globalThis.process?.env ?? {}, ...(formsDifficulty && { difficulty: formsDifficulty }) })
  const systemPath = basePath.slice(0, basePath.lastIndexOf('/'))
  const assistant = assistantSettings(options.assistant, globalThis.process?.env ?? {})
  const runtime = runtimeUrl(options.runtime, globalThis.process?.env ?? {})
  const errorReporting = errorReportingSettings(options.errorReporting, globalThis.process?.env ?? {})
  const maps = mapSettings(options.maps, globalThis.process?.env ?? {})
  const plugins = pluginOptions(options.plugins, globalThis.process?.env ?? {}, bundlePlugins)
  const sources = sourceOptions(options.sources, globalThis.process?.env ?? {})
  checkSourceNames(sources, { resources: registry.entries.map((entry) => entry.name), pages: pageModels.map((entry) => entry.name) })
  const files = createFilesRuntime({ ...(filesOptions && { options: filesOptions }), env: globalThis.process?.env ?? {}, models: registry.entries.map((entry) => entry.model), systemPath })
  const table = webhooksOptions && webhookTable(webhooksOptions, auth)
  // AI fields and actions call the assistant's model; without a key they fail when used, and dev and serve stop at startup (see `checkAi`)
  const withAi = withAiFields || hasAiActions(viewModels)
  const model = withAi ? aiModel(options.assistant, globalThis.process?.env ?? {}) : undefined
  const fill = withAiFields ? fillJob(() => deps) : undefined
  const deps: Deps = {
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
    hooks: [...(options.writeHooks ?? []), ...(table ? [subscriptionWriteCheck(registry.entries.map((entry) => entry.model), table.checkUrl)] : []), ...(fill ? [fillHook(() => deps, fill)] : [])],
    audit: options.audit ?? consoleAuditQueue(),
    accessOptions: { ...(options.roles && { roles: options.roles }), ...(options.defaultAccess && { defaultAccess: options.defaultAccess }) },
    rowPermissions: (resource: string) => (typeof options.rowPermissions === 'object' ? !options.rowPermissions.except.includes(resource) : options.rowPermissions !== false),
    ...(assistant && { assistant: assistant.kind === 'external' ? assistant.url : `${systemPath}/assistant` }),
    ...(runtime && { runtime }),
    ...(errorReporting && { errorReporting }),
    ...(maps && { maps }),
    plugins,
    sources,
    ...(files && { files }),
    ...(appModels.some(isCaptured) && { actorSetting: `${changes}.actor` }),
    ...(withHistory && { history: { schema: changes, ...(auth && { actorNames: betterAuthActorNames(auth) }) } }),
    ...(mentions && { comments: { ...(commentUsers && { users: commentUsers }), mentionJob: mentions, appOrigin: appOrigin(auth?.origins ?? []) } }),
    ...(withAi && { ai: { ...(model && { model }), ...(options.onUnhandledError && { report: options.onUnhandledError }) } }),
  }

  // The tabs end in the name the app signs in and mails as.
  const meta = createMeta(deps, auth?.appName ?? readAppName(globalThis.process?.env ?? {}) ?? defaultAppName)
  const onError = createErrorHandler(options.onUnhandledError)
  // Every response of the resources API and of the system endpoints names the models version; every request needs a
  // token, but one to the resources API or `/meta` when the project has an anonymous role.
  const guarded = (routes: (app: Hono<AdminEnv>) => void, caller: Authenticator = authenticate) => {
    const app = new Hono<AdminEnv>()
    app.onError(onError)
    app.use('*', async (c, next) => {
      await next()
      c.res.headers.set('X-Meta-Version', await meta.version(c.get('session')?.user.roles ?? []))
    })
    app.use('*', async (c, next) => {
      c.set('session', await caller(c.req.raw))
      await next()
    })
    routes(app)
    return app
  }
  // `/api/v1/*` is only resources, so a table may be called `meta` or `docs`; the system endpoints live beside it.
  const api = guarded((app) => {
    app.route('/', collectionRoutes(deps))
    app.route('/', recordRoutes(deps))
  }, withAnonymous(authenticate, options.roles))
  const system = guarded((app) => {
    app.route('/', docsRoutes(deps))
  })
  // `/meta` tells anonymous visitors what they may read, for the admin app they browse without signing in.
  const metaApp = guarded((app) => {
    app.route('/', metaRoutes(meta))
  }, withAnonymous(authenticate, options.roles))

  const app = new Hono<AdminEnv>()
  app.onError(onError)
  const corsOrigins = options.cors ?? readCorsOrigins(globalThis.process?.env ?? {})
  const ownOrigins = auth?.origins ?? []
  if (corsOrigins !== undefined || ownOrigins.length > 1) {
    // Better Auth checks origins itself, and a function with its own `cors` answers for itself.
    const answering = [authBasePath, ...Object.entries(apiFunctions).filter(([, fn]) => fn.options.cors).map(([name]) => `${systemPath}/functions/${name}`)]
    const skip = (path: string) => answering.some((prefix) => path === prefix || path.startsWith(`${prefix}/`))
    app.use(`${systemPath}/*`, apiCors({ own: ownOrigins, allowed: corsOrigins ?? [], skip }))
  }
  if (auth) {
    app.route(authBasePath, statusRoute(auth, { anonymous: visitorsBrowse(options.roles), plugins: pluginsBeforeSignIn(plugins) }))
    if (auth.organizations) app.route(authBasePath, organizationRoutes({ auth, audit: deps.audit, registry, db }))
    app.on(['GET', 'POST'], `${authBasePath}/*`, (c) => auth.handler(c.req.raw))
    // On several origins, each says which origins may use the app's passkeys: all of them (Related Origin Requests).
    if (auth.origins.length > 1) app.get(webauthnPath, (c) => c.json({ origins: auth.origins }))
  }
  if (assistant?.kind === 'built-in') {
    const tools = options.assistant ? options.assistant.tools : undefined
    const records = (session: Session) => assistantRecords(deps, session)
    app.route(`${systemPath}/assistant`, builtInAssistant({ model: assistant.model, chats: assistant.chats, db, meta, authenticate, tools, records, report: options.onUnhandledError }))
  }
  app.route('/', functionRoutes({ basePath: `${systemPath}/functions`, functions: apiFunctions, authenticate, db, records: (session) => callerRecords(deps, session), onError }))
  app.route('/', batchRoute(deps, authenticate, meta))
  app.route('/', fileRoutes(deps, authenticate))
  // Before the system endpoints, which want a token for everything under them
  if (forms) app.route(`${systemPath}/forms`, formRoutes(deps, forms))
  // Anyone who may read a live resource hears of its changes, a visitor of what the anonymous role reads too.
  if (appModels.some((model) => model.live)) {
    const feed = tableFeed({ db, schema: changes, report: options.onUnhandledError ?? ((error) => console.error(error)) })
    app.route(systemPath || '/', guarded((live) => void live.route('/', liveRoutes(feed, (session) => visibleNotices(deps, session))), withAnonymous(authenticate, options.roles)))
  }
  app.route(basePath, api)
  app.route(`${deps.systemPath}/meta`, metaApp)
  app.route(deps.systemPath || '/', system)
  const webhooks = createWebhooks({ deps, subscriptions, functions: apiFunctions, schema: changes, log: (line) => console.log(line), ...(table && { table }) })
  return Object.assign(app, { jobs: [...webhooks.jobs, ...(withHistory && days !== undefined ? [pruneHistoryJob(changes, days)] : []), ...(mentions ? [mentions] : []), ...(fill ? [fill] : [])] })
}
