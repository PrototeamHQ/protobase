import { Hono } from 'hono'
import type { UpgradeWebSocket } from 'hono/ws'
import type { JWTPayload } from 'jose'
import { accountPage, accountPageName, checkPages, settingsResources, withSettingsFields } from '@protobase/layout'
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
import { apiCors, readCorsOrigins, withMobileOrigins } from './api-cors'
import type { MobileConfig } from './mobile-config'
import type { AppIdentity } from './app-identity'
import type { AppIcons } from './web-app/app-icons'
import { apiKeySettings } from './api-keys/api-key-settings'
import { apiKeyCaller } from './api-keys/resolve-caller'
import { jwtVerifier } from './auth/jwt'
import { unauthorized } from './problem'
import { realtimeApp } from './realtime/realtime-app'
import { realtimeHubs } from './realtime/realtime-hubs'
import { channelRoutes } from './channels/channel-routes'
import { channelSender } from './channels/channel-sender'
import { databaseSends } from './channels/database-sends'
import { startRealtimePrune } from './realtime/realtime-prune'
import { relayed, sqlSends, type RealtimeOptions } from './realtime/relay/realtime-options'
import { restRoutes } from './rest/rest-routes'
import { storageRoutes } from './storage/storage-routes'
import { shownAppName } from './app-name'
import { authBasePath, type AdminAuth } from './better-auth/create-auth'
import { mcpDiscovery } from './better-auth/mcp/discovery-routes'
import { mcpApprovals } from './mcp/mcp-approval-store'
import { mcpAuthenticator } from './mcp/mcp-authenticator'
import { mcpToolContext } from './mcp/mcp-context'
import { mcpHandler } from './mcp/mcp-handler'
import { closedMcpRoutes, mcpRoutes } from './mcp/mcp-routes'
import { mcpServer } from './mcp/mcp-server'
import { mcpTools } from './mcp/mcp-tools'
import { checkMcpWrites, rolesWithoutApproval } from './mcp/mcp-writes'
import { withoutSessionTokens } from './better-auth/without-session-tokens'
import { webauthnPath } from './better-auth/origins'
import { organizationRoutes } from './better-auth/organizations/admin-routes'
import { statusRoute } from './better-auth/status-route'
import { betterAuthSessionToken } from './better-auth/session-token'
import { goTrueTokens } from './gotrue/access-tokens'
import { goTruePath } from './gotrue/keys'
import { realtimePath, restPath, storagePath, supabaseFunctionsPath, supabasePath } from './supabase-paths'
import { goTrueRoutes } from './gotrue/routes'
import { wakeDispatch } from './changes/actor'
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
import { subscriptionUrlCheck, subscriptionWriteCheck } from './webhooks/table/validate-hook'
import type { WebhooksOptions } from './webhooks/table/options'
import type { NotificationsOptions } from './notifications/options'
import type { CallsOptions } from './calls/calls-options'
import { deviceStore, removeDevicesWithUsers } from './notifications/device-store-of'
import { historyStore, removeHistoryWithUsers } from './notifications/history-store-of'
import { historyRoutes } from './notifications/history-routes'
import { devicesPath, historyPath } from './notifications/paths'
import { deviceRoutes } from './notifications/routes'
import { notificationSenders, webPushKey } from './notifications/senders-of'
import { pushJob } from './notifications/push-job'
import { liveSessions } from './better-auth/live-sessions'
import type { SubscriptionDefinition } from './webhooks/subscription'
import { visitorsBrowse, withAnonymous } from './anonymous'
import { checkBottomBars, checkShell } from './check-shell'
import { checkOwnerFields } from './check-owners'
import { checkRoleLimits } from './check-roles'
import { checkParents, parentWarnings } from './check-parents'
import { checkPositionAfter } from './check-position-after'
import { checkViews } from './check-views'
import { liveRoutes } from './live/live-route'
import { tableFeed } from './live/notice-feed'
import { visibleNotices } from './live/visible-notices'
import { createErrorHandler } from './error-handler'
import { defaultStatementTimeoutMs } from './statement-timeout'
import { errorReportingSettings } from './error-reporting/error-reporting-settings'
import type { FilesOptions } from './files/options'
import { fileRoutes } from './files/routes'
import type { Difficulty } from './forms/challenge'
import { formRoutes } from './forms/routes'
import { createFormsRuntime } from './forms/runtime'
import { createFilesRuntime } from './files/runtime'
import { fieldDecrypter } from './encryption/decrypt-field'
import { createEncryptionRuntime } from './encryption/runtime'
import { toApiFunction, type FunctionSource } from './functions/define-function'
import { callerRecords } from './functions/records'
import { functionRoutes } from './functions/routes'
import { supabaseFunctionRoutes } from './functions/supabase-routes'
import { upgradeAuthenticator } from './functions/upgrade-caller'
import { localeSetting } from './locale/locale-option'
import { requestLocale } from './locale/request-locale'
import { mapSettings } from './maps/map-settings'
import { createMeta } from './meta'
import { buildRegistry } from './registry'
import type { ResourceSource } from './resource-source'
import { batchRoute } from './routes/batch'
import { collectionRoutes } from './routes/collection'
import { docsRoutes } from './routes/docs'
import { metaRoutes } from './routes/meta'
import { webManifestRoute } from './web-app/web-manifest-route'
import { mcpIcons } from './web-app/mcp-icons'
import { faviconPath } from './web-app/web-manifest'
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
  /** The app's secret (`secret`): it signs public forms' bot checks, and upload tickets unless `files.secret` names another. */
  secret?: string
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
  /** Webhook subscriptions made in the admin app, from `webhooks: {}` (see `WebhooksOptions`). */
  webhooks?: WebhooksOptions
  /** How `/api/sb/realtime/v1` and `/api/channels` are served: by one process or several, and whether SQL sends to channels (see `RealtimeOptions`). */
  realtime?: RealtimeOptions
  /** Each user's devices and the endpoints that register them, from `notifications: {}` (see `NotificationsOptions`). */
  notifications?: NotificationsOptions
  /** The media server behind the calls functions admit members to with `calls.join` (see `CallsOptions`). */
  calls?: CallsOptions
  /**
   * The app's iOS and Android build (see `MobileConfig`): the API answers its Capacitor origins through CORS, and sign-in
   * at `/api/auth` trusts the Capacitor origin a request names, without CORS, as the app calls it through native HTTP.
   */
  mobile?: MobileConfig
  /** The app's colours, which its web manifest carries (see `AppIdentity`). */
  app?: AppIdentity
  /**
   * The icons the project has of its own, as `protobase build` and `protobase dev` find them beside its favicon: the
   * web manifest and the MCP server name its PNGs, and `/meta` the favicon when it is the project's, which the sidebar's logo draws.
   */
  icons?: AppIcons
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
  /** @internal Verifies a user's token on `/api/sb/rest/v1`, `/api/sb/realtime/v1` and `/api/sb/storage/v1` and gives its claims, which tests fake; those `/api/sb/auth/v1` signs otherwise. */
  verifyToken?: (token: string) => Promise<JWTPayload>
  /**
   * The host's WebSocket upgrade, `@hono/node-server`'s `upgradeWebSocket`, the only one supported: function sockets use
   * its `ws` socket's send callback and `bufferedAmount`. With it, functions accept sockets, and an app with keys and
   * live resources serves supabase-js's Realtime at `/api/sb/realtime/v1/websocket`; without it, the app serves none.
   */
  upgradeWebSocket?: UpgradeWebSocket
}

// The roles a user can hold, from the auth instance and `defineRoles`; unknown when the app declares neither.
const declaredRoles = (auth: AdminAuth | undefined, roles: AdminOptions['roles']) => {
  const names = [...(auth?.roles ?? []), ...Object.keys(roles?.definitions ?? {})]
  return names.length > 0 ? [...new Set(names)] : undefined
}

/** The admin REST API as a Hono app. It uses only Web APIs, so it runs on Node, Workers and anywhere else Hono does. */
export const createAdmin = ({ resources: appResources, views: appViews = [], pages = [], userMenu, bottomBars = [], db, authenticate, auth, functions = {}, secret, files: filesOptions, events, history: historyOptions, jobs = [], subscriptions = [], webhooks: webhooksOptions, realtime, notifications, calls, mobile, app: identity, icons, bundlePlugins = [], fieldTypes = {}, options = {}, formsDifficulty, commentUsers: givenCommentUsers, verifyToken, upgradeWebSocket }: CreateAdminInput): Admin => {
  const basePath = options.basePath ?? '/api/v1'
  // Events are delivered, history kept, mentions mailed, AI fields filled and notifications sent by jobs, whose failures the page lists too.
  // Admins list the history as Activity and every comment as Comments.
  const appModels = appResources.map((resource) => resource.toModel())
  const withComments = appModels.some((model) => model.comments)
  const withAiFields = hasAiFields(appModels)
  const withJobs = jobs.length > 0 || appModels.some(isCaptured) || withComments || withAiFields || notifications !== undefined
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
  const mentions = withComments ? mentionJob(commentUsers, shownAppName(auth, globalThis.process?.env ?? {})) : undefined
  const registry = buildRegistry(resources)
  const apiFunctions = Object.fromEntries(Object.entries(functions).map(([name, source]) => [name, toApiFunction(name, source)]))
  const viewModels = views.map((view) => view.toModel())
  const userMenuModel = userMenu?.toUserMenuModel()
  // The page named `account` is the signed-in person's own, at `/-/account` rather than beside the others; the standard
  // one when the app has none.
  const allPages = pages.map((entry) => entry.toModel())
  const pageModels = allPages.filter((entry) => entry.name !== accountPageName)
  const accountModel = allPages.find((entry) => entry.name === accountPageName) ?? accountPage.toModel()
  checkShell(registry, viewModels, userMenuModel, pageModels.map((entry) => entry.name))
  const bottomBarModels = bottomBars.map((bar) => bar.toBottomBarModel())
  checkBottomBars(registry, bottomBarModels, pageModels.map((entry) => entry.name), declaredRoles(auth, options.roles))
  checkViews(registry, viewModels, pageModels.map((entry) => entry.name), fieldTypes)
  checkRoleLimits(registry, options.roles?.limits ?? [])
  checkOwnerFields(registry, authenticate.userIdType, auth)
  const mcpAuthenticate = mcpAuthenticator(authenticate, auth?.mcp, options.mcp)
  if (options.mcp) checkMcpWrites(registry, declaredRoles(auth, options.roles), options.mcp.writes)
  checkPositionAfter(registry)
  checkParents(registry)
  for (const warning of parentWarnings(registry)) console.warn(warning)
  const resourceModels = Object.fromEntries(registry.entries.map((entry) => [entry.name, entry.model]))
  checkPages([...pageModels, accountModel], {
    models: resourceModels,
    actions: (resource) => new Set(viewModels.filter((view) => view.resource === resource).flatMap((view) => view.actions.map((action) => action.name))),
    createPages: new Set(viewModels.filter((view) => view.create).map((view) => view.resource)),
  })
  const forms = createFormsRuntime({ registry, views: viewModels, limits: options.roles?.limits ?? [], env: globalThis.process?.env ?? {}, ...(secret && { secret }), ...(formsDifficulty && { difficulty: formsDifficulty }) })
  const systemPath = basePath.slice(0, basePath.lastIndexOf('/'))
  const assistant = assistantSettings(options.assistant, globalThis.process?.env ?? {})
  const runtime = runtimeUrl(options.runtime, globalThis.process?.env ?? {})
  const errorReporting = errorReportingSettings(options.errorReporting, globalThis.process?.env ?? {})
  const maps = mapSettings(options.maps, globalThis.process?.env ?? {})
  // At startup, so a wrong VAPID variable stops the server; the sending code calls them through these.
  const senders = notifications ? notificationSenders(notifications) : []
  const pushKey = webPushKey(senders)
  const locale = localeSetting(options.locale)
  const plugins = pluginOptions(options.plugins, globalThis.process?.env ?? {}, bundlePlugins)
  const sources = sourceOptions(options.sources, globalThis.process?.env ?? {})
  checkSourceNames(sources, { resources: registry.entries.map((entry) => entry.name), pages: pageModels.map((entry) => entry.name) })
  const apiKeys = apiKeySettings(options.apiKeys, globalThis.process?.env ?? {})
  const servesKeys = Boolean(apiKeys.publishable || apiKeys.secret)
  const encryption = createEncryptionRuntime({ models: registry.entries.map((entry) => entry.model), env: globalThis.process?.env ?? {} })
  const files = createFilesRuntime({ ...(filesOptions && { options: filesOptions }), ...(secret && { secret }), env: globalThis.process?.env ?? {}, models: registry.entries.map((entry) => entry.model), systemPath, storage: servesKeys })
  const table = webhooksOptions && webhookTable(webhooksOptions, auth)
  // AI fields and actions call the assistant's model; without a key they fail when used, and dev and serve stop at startup (see `checkAi`)
  const withAi = withAiFields || hasAiActions(viewModels)
  const model = withAi ? aiModel(options.assistant, globalThis.process?.env ?? {}) : undefined
  const fill = withAiFields ? fillJob(() => deps) : undefined
  const deps: Deps = {
    db,
    registry,
    views: viewModels,
    pages: pageModels.map((entry) => withSettingsFields(entry, resourceModels)),
    account: withSettingsFields(accountModel, resourceModels),
    ...(userMenuModel && { userMenu: userMenuModel }),
    bottomBars: bottomBarModels,
    basePath,
    systemPath,
    statementTimeoutMs: options.statementTimeoutMs ?? defaultStatementTimeoutMs,
    guard: createScanGuard(db, options.scanGuard),
    hooks: [...(options.writeHooks ?? []), ...(table ? [subscriptionWriteCheck(registry.entries.map((entry) => entry.model))] : []), ...(fill ? [fillHook(() => deps, fill)] : [])],
    writeChecks: table?.checkUrl ? [subscriptionUrlCheck(table.checkUrl)] : [],
    audit: options.audit ?? consoleAuditQueue(),
    report: options.onUnhandledError ?? ((error: unknown) => console.error(error)),
    accessOptions: { ...(options.roles && { roles: options.roles }), ...(options.defaultAccess && { defaultAccess: options.defaultAccess }) },
    settingsResources: settingsResources([...pageModels, accountModel]),
    rowPermissions: (resource: string) => (typeof options.rowPermissions === 'object' ? !options.rowPermissions.except.includes(resource) : options.rowPermissions !== false),
    ...(assistant && { assistant: assistant.kind === 'external' ? assistant.url : `${systemPath}/assistant` }),
    ...(runtime && { runtime }),
    ...(errorReporting && { errorReporting }),
    ...(maps && { maps }),
    ...(notifications && notifications.ui !== false && { bell: true }),
    ...(pushKey && { webPushKey: pushKey }),
    ...(locale && { locale }),
    plugins,
    sources,
    ...(files && { files }),
    ...(encryption && { encryption }),
    ...(appModels.some(isCaptured) && { actorSetting: `${changes}.actor` }),
    ...(withHistory && { history: { schema: changes, ...(auth && { actorNames: betterAuthActorNames(auth) }) } }),
    ...(mentions && { comments: { ...(commentUsers && { users: commentUsers }), mentionJob: mentions, appOrigin: appOrigin(auth?.origins ?? []) } }),
    ...(withAi && { ai: { ...(model && { model }), ...(options.onUnhandledError && { report: options.onUnhandledError }) } }),
  }

  // The tabs end in the name the app signs in and mails as, which the installed app is called too.
  const appName = shownAppName(auth, globalThis.process?.env ?? {})
  const meta = createMeta(deps, appName, icons?.favicon ? faviconPath : undefined)
  const onError = createErrorHandler(options.onUnhandledError, deps.statementTimeoutMs)
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
  const corsOrigins = withMobileOrigins(options.cors ?? readCorsOrigins(globalThis.process?.env ?? {}), Boolean(mobile))
  const ownOrigins = auth?.origins ?? []
  if (corsOrigins !== undefined || ownOrigins.length > 1) {
    // Better Auth checks origins itself, and a function with its own `cors` answers for itself.
    const answering = [authBasePath, ...(auth?.mcp ? [auth.mcp.path] : []), ...Object.entries(apiFunctions).filter(([, fn]) => fn.options.cors).flatMap(([name]) => [`${systemPath}/functions/${name}`, `${supabaseFunctionsPath}/${name}`])]
    const skip = (path: string) => answering.some((prefix) => path === prefix || path.startsWith(`${prefix}/`))
    const cors = apiCors({ own: ownOrigins, allowed: corsOrigins ?? [], skip })
    app.use(`${systemPath}/*`, cors)
    // supabase-js on the app's other origins, or another website, calls `/api/sb` too.
    if ((servesKeys || auth) && !supabasePath.startsWith(`${systemPath}/`)) app.use(`${supabasePath}/*`, cors)
  }
  if (auth) {
    app.route(authBasePath, statusRoute(auth, { anonymous: visitorsBrowse(options.roles), plugins: pluginsBeforeSignIn(plugins), ...(locale && { locale }) }))
    if (auth.organizations) app.route(authBasePath, organizationRoutes({ auth, audit: deps.audit, registry, db }))
    if (auth.mcp) mcpDiscovery(app, auth)
    const answer = mobile ? auth.handleMobile : auth.handler
    app.on(['GET', 'POST'], `${authBasePath}/*`, async (c) => withoutSessionTokens(c.req.raw, await answer(c.req.raw)))
    // The same sign-in for supabase-js and @supabase/ssr, at the address and in the shape of Supabase's.
    app.route(goTruePath, goTrueRoutes(auth))
    // On several origins, each says which origins may use the app's passkeys: all of them (Related Origin Requests).
    if (auth.origins.length > 1) app.get(webauthnPath, (c) => c.json({ origins: auth.origins }))
  }
  if (assistant?.kind === 'built-in') {
    const tools = options.assistant ? options.assistant.tools : undefined
    const records = (session: Session) => assistantRecords(deps, session)
    app.route(`${systemPath}/assistant`, builtInAssistant({ model: assistant.model, chats: assistant.chats, db, meta, authenticate, tools, records, report: options.onUnhandledError }))
  }
  const { report } = deps
  // Before the system endpoints, which want an app token for everything under them
  if (auth?.mcp && options.mcp === false) closedMcpRoutes(app, auth.mcp.path)
  else if (auth?.mcp && mcpAuthenticate) {
    const writes = (options.mcp !== false && options.mcp?.writes) || false
    const commented = registry.entries.filter((entry) => entry.model.comments).map((entry) => entry.name)
    const tools = mcpTools({ db, sql: options.mcp !== false && options.mcp?.sql === true, writes, commented, own: (options.mcp !== false && options.mcp?.tools) || [] })
    const approvals = mcpApprovals()
    const { resource } = auth.mcp
    const info = { name: appName, version: '1.0.0', icons: mcpIcons(resource, icons) }
    const server = (session: Session, request: Request | undefined) => {
      const context = mcpToolContext(deps, meta, session, { locale: request ? requestLocale(locale, request) : locale, requestURL: request?.url ?? resource })
      return mcpServer({ info, tools: tools(session), context, report, rolesWithoutApproval: rolesWithoutApproval(writes), approvals })
    }
    mcpRoutes(app, { path: auth.mcp.path, handler: mcpHandler({ authenticate: mcpAuthenticate, resource: auth.mcp.resource, scope: auth.mcp.scope, server }) })
  }
  const upgradeAuthenticate = upgradeAuthenticator({ authenticate, ...(auth && { origins: auth.origins, sessionToken: betterAuthSessionToken(auth) }) })
  const decryptField = fieldDecrypter(deps)
  // The broadcasts and presences of both realtime APIs, apart, through one relay with several processes.
  const hubs = realtimeHubs(deps, realtime, report)
  const channels = channelSender(registry, hubs.records.broadcasts)
  app.route('/', functionRoutes({ basePath: `${systemPath}/functions`, functions: apiFunctions, authenticate, access: deps.accessOptions, db, records: (session) => callerRecords(deps, session), channels, decryptField, onError, wake: () => wakeDispatch(deps), upgradeWebSocket, upgradeAuthenticate, ...(calls && { calls }), report }))
  // Channels named by records, with presence and broadcasts, for whoever may read the record, a visitor too.
  if (upgradeWebSocket) {
    const visitors = (caller: Authenticator) => withAnonymous(caller, options.roles)
    // SQL's sends, with `sqlSends`, are read like the other processes' broadcasts: while a socket is open.
    const sends = sqlSends(realtime) ? databaseSends({ db, statementTimeoutMs: deps.statementTimeoutMs, registry, broadcasts: hubs.records.broadcasts, report }) : undefined
    const follow = () => {
      const unrelay = hubs.follow()
      const unsend = sends?.follow()
      return () => (unsend?.(), unrelay())
    }
    app.route(systemPath || '/', channelRoutes({ deps, upgradeWebSocket, authenticate: visitors(authenticate), authenticateUpgrade: visitors(upgradeAuthenticate), onError, hubs: hubs.records, follow, report }))
  }
  // supabase-js's `functions.invoke`, admitted by the app's keys and the tokens of `/api/sb/auth/v1`.
  const verifyGoTrue = auth ? jwtVerifier(goTrueTokens({ auth })) : () => Promise.reject(unauthorized('This app signs no user tokens'))
  app.route('/', supabaseFunctionRoutes({ functions: apiFunctions, db, keys: apiKeys, caller: apiKeyCaller({ keys: apiKeys, verify: verifyGoTrue }), onError }))
  app.route('/', batchRoute(deps, authenticate, meta))
  app.route('/', fileRoutes(deps, authenticate))
  // Before the system endpoints, which want a token for everything under them
  if (notifications) {
    const devices = deviceStore(db, notifications)
    if (auth) removeDevicesWithUsers(auth, devices)
    app.route(devicesPath(systemPath), guarded((routes) => void routes.route('/', deviceRoutes(devices, { sessionRequired: Boolean(auth) }))))
    const history = historyStore(db, notifications)
    if (auth) removeHistoryWithUsers(auth, history)
    app.route(historyPath(systemPath), guarded((routes) => void routes.route('/', historyRoutes(history, auth?.origins ?? []))))
  }
  if (forms) app.route(`${systemPath}/forms`, formRoutes(deps, forms))
  // The notices are read only while a page or channel listens.
  const feed = tableFeed({ db, schema: changes, report })
  // supabase-js's `from()`, `rpc()`, `channel()` and `storage`, admitted by the app's keys and the tokens `/api/sb/auth/v1` signs.
  if (servesKeys) {
    const verify = verifyToken ?? (auth ? jwtVerifier(goTrueTokens({ auth })) : () => Promise.reject(unauthorized('This app signs no user tokens')))
    const caller = apiKeyCaller({ keys: apiKeys, verify })
    // `from()` and `rpc()` under the tables' RLS.
    app.route(restPath, restRoutes({ deps, caller, report }))
    // `postgres_changes` of the live resources under the tables' RLS, broadcasts and presence.
    if (upgradeWebSocket) app.route(realtimePath, realtimeApp({ deps, feed, upgradeWebSocket, caller, report, hubs }))
    // `storage` under the storage schema's RLS.
    if (files?.storage) {
      const storage = { db, statementTimeoutMs: deps.statementTimeoutMs, ...(deps.actorSetting && { actorSetting: deps.actorSetting }), store: files.providers[files.storage.provider]!.store, signer: files.signer, maxBytes: files.storage.maxBytes, caller }
      app.route(storagePath, storageRoutes({ deps: storage, report }))
    }
  }
  // After `/api/sb`, which the guard's token check under the system path would otherwise stand before.
  // Anyone who may read a live resource hears of its changes, a visitor of what the anonymous role reads too.
  if (appModels.some((model) => model.live)) {
    app.route(systemPath || '/', guarded((live) => void live.route('/', liveRoutes(feed, (session) => visibleNotices(deps, session))), withAnonymous(authenticate, options.roles)))
  }
  app.route(basePath, api)
  app.route(`${deps.systemPath}/meta`, metaApp)
  // Before the system endpoints, which want a token for everything under them
  app.route(systemPath || '/', webManifestRoute(appName, identity, icons))
  app.route(deps.systemPath || '/', system)
  const webhooks = createWebhooks({ deps, subscriptions, functions: apiFunctions, channels, schema: changes, log: (line) => console.log(line), ...(table && { table }) })
  const prune = () => startRealtimePrune({ db, statementTimeoutMs: deps.statementTimeoutMs, relayed: relayed(realtime), sqlSends: sqlSends(realtime), report })
  return Object.assign(app, { startRealtimePrune: prune, decryptField, jobs: [...webhooks.jobs, ...(withHistory && days !== undefined ? [pruneHistoryJob(changes, days)] : []), ...(mentions ? [mentions] : []), ...(fill ? [fill] : []), ...(notifications ? [pushJob(notifications, senders, auth && liveSessions(auth))] : [])] })
}
