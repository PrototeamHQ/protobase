import { upgradeWebSocket } from '@hono/node-server'
import { Hono } from 'hono'
import { apiKeySettings, assistantSettings, authSchemaDrift, authStoreTables, checkAi, checkCalls, checkAuthSchema, checkChanges, checkChannelSends, checkComments, checkComputed, checkNotificationsSchema, checkQueryRunner, checkRealtimeRelay, checkResourcesOutsideAuthStore, checkStatusSchema, checkWebhooksSchema, configExports, hasUsers, relayed, sqlSends } from '@protobase/server'
import { projectIcons } from '../build/app-icons'
import { projectErrorReporter } from '../project/error-reporter'
import { projectAdmin } from '../project/project-admin'
import { buildProject } from '../config/build-project'
import { devJobs } from './dev-jobs'
import { devRealtimePrune } from './dev-prune'
import { devDatabase, loadDevConfig } from './project'
import { withDevServiceWorker } from './service-worker-route'
import { setMissing, supabaseEnv } from './supabase-env'

// Loaded by Vite's SSR module graph (see run.ts). Editing any file it imports re-evaluates this module
// on the next request, which rebuilds the API; `/meta` then reports a new X-Meta-Version.
const projectDir = process.env.PROTOBASE_PROJECT!
const config = await loadDevConfig(projectDir, JSON.parse(process.env.PROTOBASE_EXTENSIONS ?? '[]'))
const database = devDatabase(projectDir)
const { db } = database
// The app as it serves, built from the config: its references loaded, auth and the authenticator made.
const project = await buildProject(config, database)
const { resources, views } = configExports(project.config)

// Once per server start, so a behind auth schema stops startup with the command that writes its migration.
const store = globalThis as { __protobaseAuthSchemaChecked?: boolean }
if (project.auth && !store.__protobaseAuthSchemaChecked) {
  await checkAuthSchema(project.auth)
  store.__protobaseAuthSchemaChecked = true
}

// On every load, since editing the config can add a resource over a table of the auth store, give a resource events or
// history whose triggers the database lacks, or comments whose table it lacks, or rollups and formulas whose columns it lacks.
if (project.auth) await checkResourcesOutsideAuthStore(db, resources.map((resource) => resource.toModel()), project.auth)
await checkChanges(db, resources.map((resource) => resource.toModel()), project.events)
await checkComments(db, resources.map((resource) => resource.toModel()))
await checkCalls(db, project.calls)
await checkComputed(db, resources.map((resource) => resource.toModel()))
// The built-in assistant's read-only queries run as a role of their own, which must not read the auth store.
if (assistantSettings(project.options?.assistant, process.env)?.kind === 'built-in') await checkQueryRunner(db, project.auth ? authStoreTables(project.auth) : { tables: [], schemas: [] })
// AI fields and actions call the model of PROTOBASE_ASSISTANT_API_KEY, which other commands need not have.
checkAi({ models: resources.map((resource) => resource.toModel()), views: views.map((source) => source.toModel()), assistant: project.options?.assistant, env: process.env })
if (project.webhooks) await checkWebhooksSchema(db, project.webhooks)
if (relayed(project.realtime)) await checkRealtimeRelay(db)
if (sqlSends(project.realtime)) await checkChannelSends(db)
if (project.notifications) await checkNotificationsSchema(db, project.notifications, project.auth)
if (project.status) await checkStatusSchema(db, project.status, project.auth)

// Functions moved from Supabase read Supabase's variables, of this app, unless .env sets them.
setMissing(process.env, supabaseEnv({
  url: process.env.PROTOBASE_DEV_URL!,
  databaseUrl: process.env.PROTOBASE_DATABASE_URL!,
  keys: apiKeySettings(project.options?.apiKeys, process.env),
  withAuth: Boolean(project.auth),
}))

// With a DSN set, the API's 500s go to the error tracker too; a crash is the terminal's to show. Its `/api/sb/realtime/v1`
// sockets are upgraded by run.ts's `apiWebSockets`.
const reporter = await projectErrorReporter(config, process.env)
// The plugins come from Vite here, not a bundle; the icons are the project's files, which the dev server answers.
const ui = { plugins: [], fieldTypes: {}, icons: projectIcons(projectDir) }
const { admin, jobs } = projectAdmin(project, db, ui, reporter, upgradeWebSocket)

// The project's jobs and the delivery of its events, run in this server; a behind jobs schema stops startup with the
// command that writes its migration.
await devJobs(db, jobs, admin.decryptField, project.mailer)
// The old rows of the realtime tables, pruned while the dev server runs, whether or not a socket is open.
devRealtimePrune(admin)

// The push worker, with notifications() alone.
export default withDevServiceWorker(new Hono(), Boolean(project.notifications)).route('/', admin)

/** Whether the auth store has a user yet, for the banner's sign-in line; undefined without one. */
export const anyUsers = () => (project.auth ? hasUsers(project.auth) : Promise.resolve(undefined))

/**
 * How the auth store's tables differ from what the project's Better Auth needs, for the banner's warnings: the one
 * comparison of the store's tables, made in development only, since a deploy reads the store's record of migrations.
 */
export const authDrift = () => (project.auth ? authSchemaDrift(project.auth) : Promise.resolve([]))
