import type { PostgresPool } from 'kysely'
import type { Db } from '@protobase/query'
import type { AdminAuth, AdminOptions, AuthHooks, AppIdentity, Authenticator, CallsOptions, Mailer, EventsOptions, FilesOptions, FunctionSource, HistoryOptions, JobDefinition, MobileConfig, NotificationsOptions, RealtimeOptions, StatusOptions, WebhooksOptions, WorkflowsOptions } from '@protobase/server'
import { buildAppAuth, buildAuthenticator, checkCallsOptions, checkStatusOptions, workflowPlugins } from '@protobase/server/internal'
import type { MergedConfig } from './merge-config'
import { projectFiles, projectFunctions, projectJobs, projectNotifications, projectOptions, projectResources, projectWebhooks, projectWorkflows } from './project-parts'
import { userTablesOn } from './user-tables-config'

/**
 * The app's database: Kysely over its pool, and the pool itself, which its Better Auth store shares; a test's database
 * without auth may have none.
 */
export type AppDatabase = { db: Db; pool?: PostgresPool }

/**
 * The app's own mailer, the default export of its auth/mailer.ts: what sign-in and the jobs (`context.mail`) both send
 * with; `undefined` without one, when both send through `PROTOBASE_SMTP_URL`.
 */
export const projectMailer = async (config: MergedConfig) => (await config.authFiles?.module('auth/mailer.ts')?.())?.default as Mailer | undefined

/**
 * The app's sign-in, built from `auth` with the app's URL, secrets, signing key rotation and name, the hooks of its
 * auth/hooks.ts and the app's mailer when it has them; none without `auth`.
 */
export const projectAuth = async (config: MergedConfig, { db, pool }: AppDatabase, workflows?: WorkflowsOptions): Promise<AdminAuth | undefined> => {
  if (!config.auth) return undefined
  if (!pool) throw new Error("auth needs the app's pool, which its store shares")
  const { url, secret, previousSecrets, signingKeyDays, signingKeyGraceDays, name } = config
  if (!url) throw new Error('Sign-in needs the app\'s public URL: set PROTOBASE_URL, such as https://admin.example.com, or url in protobase.config.ts')
  if (!secret) throw new Error('Sign-in needs the app\'s secret: set PROTOBASE_SECRET to the output of `openssl rand -base64 32`, or secret in protobase.config.ts')
  const [hooks, mailer] = await Promise.all([config.authFiles?.module('auth/hooks.ts')?.(), projectMailer(config)])
  return buildAppAuth(
    { ...(config.auth || {}), baseURL: url, secret, ...(previousSecrets && { previousSecrets }), ...(signingKeyDays !== undefined && { signingKeyDays }), ...(signingKeyGraceDays !== undefined && { signingKeyGraceDays }), ...(name && { appName: name }) },
    { pool, db, ...(hooks && { hooks: hooks as AuthHooks }), ...(mailer && { mailer }), ...(workflows && { workflowConnections: workflowConnectionsOf(workflows) }) },
  )
}

/** The connections the workflows' plugins declare, the defaults' among them, which people connect accounts through at sign-in. */
const workflowConnectionsOf = (workflows: WorkflowsOptions) => ({
  declared: workflowPlugins(workflows.plugins).flatMap(({ plugin }) => Object.entries(plugin.connections ?? {}).map(([name, declaration]) => ({ plugin: plugin.name, name, declaration }))),
  allowPrivateAddresses: workflows.allowPrivateAddresses === true,
})

/**
 * How the API verifies tokens: the default export of the app's auth/authenticate.ts when it has one, such as a
 * `jwtAuthenticator` for tokens of another system; otherwise the app's sign-in with the `authenticate` settings.
 */
export const projectAuthenticate = async (config: MergedConfig, auth: AdminAuth | undefined): Promise<Authenticator> => {
  const own = config.sources.map(({ files }) => files.module('auth/authenticate.ts')).findLast(Boolean)
  if (own) return (await own()).default as Authenticator
  return buildAuthenticator(config.authenticate, auth)
}

/** Everything the app runs with, built from its config at serve time: what `createAdmin` takes, and the app's own jobs. */
export type BuiltProject = {
  /** The config module: resources, views, pages and subscriptions. */
  config: Record<string, unknown>
  auth?: AdminAuth
  authenticate: Authenticator
  /** The app's secret (`secret`). */
  secret?: string
  functions?: Record<string, FunctionSource>
  files?: FilesOptions
  events?: EventsOptions
  history?: HistoryOptions
  webhooks?: WebhooksOptions
  workflows?: WorkflowsOptions
  realtime?: RealtimeOptions
  notifications?: NotificationsOptions
  status?: StatusOptions
  calls?: CallsOptions
  jobs: JobDefinition[]
  /** The app's own mailer (`projectMailer`), which the jobs send with as sign-in does. */
  mailer?: Mailer
  mobile?: MobileConfig
  app?: AppIdentity
  /** Whether the tables users add serve beside the config's resources (`userTables`). */
  userTables?: boolean
  options?: AdminOptions
}

/** The app, built from its merged config over its database: every reference loaded, auth and the authenticator made. */
export const buildProject = async (config: MergedConfig, database: AppDatabase): Promise<BuiltProject> => {
  // The workflows' plugins come first: sign-in connects the accounts their connections declare.
  const workflows = await projectWorkflows(config)
  const [resources, functions, files, options, auth, webhooks, notifications, mailer] = await Promise.all([
    projectResources(config),
    projectFunctions(config),
    projectFiles(config),
    projectOptions(config),
    projectAuth(config, database, workflows),
    projectWebhooks(config),
    projectNotifications(config),
    projectMailer(config),
  ])
  const jobs = projectJobs(config)
  // The installed app's colours, the app's other settings being the config's.
  const identity = config.themeColor || config.backgroundColor ? { ...(config.themeColor && { themeColor: config.themeColor }), ...(config.backgroundColor && { backgroundColor: config.backgroundColor }) } : undefined
  return {
    config: resources,
    authenticate: await projectAuthenticate(config, auth),
    jobs,
    ...(auth && { auth }),
    ...(functions && { functions }),
    ...(files && { files }),
    ...(config.events && { events: config.events }),
    ...(config.history && { history: config.history }),
    ...(webhooks && { webhooks }),
    ...(workflows && { workflows }),
    ...(config.realtime && { realtime: config.realtime }),
    ...(notifications && { notifications }),
    ...(config.status && { status: checkStatusOptions(config.status) }),
    ...(config.calls && { calls: checkCallsOptions(config.calls) }),
    ...(mailer && { mailer }),
    ...(config.mobile && { mobile: config.mobile }),
    ...(config.secret && { secret: config.secret }),
    ...(identity && { app: identity }),
    ...(userTablesOn(config) && { userTables: true }),
    options,
  }
}
