import { upgradeWebSocket } from '@hono/node-server'
import { Hono } from 'hono'
import { apiKeySettings, assistantSettings, authSchemaDrift, authStoreTables, checkAi, checkQueryRunner, checkResourcesOutsideAuthStore, checkMigrationRecord, configExports, hasUsers } from '@protobase/server'
import { modelHash } from '@protobase/server/internal'
import { projectIcons } from '../build/app-icons'
import { projectResources } from '../config/project-parts'
import { projectErrorReporter } from '../project/error-reporter'
import { servedAdmin } from '../project/served-admin'
import { buildProject } from '../config/build-project'
import { builtRuntimeModel } from '../config/project-modules'
import { devJobs } from './dev-jobs'
import { checkProjectRelay } from '../serve/relay-check'
import { protobaseVersion } from '../version/version'
import { withDevRelay } from './dev-relay'
import { devRealtimePrune } from './dev-prune'
import { devDatabase, loadDevConfig } from './project'
import { withDevServiceWorker } from './service-worker-route'
import { setMissing, supabaseEnv } from './supabase-env'

// Loaded by Vite's SSR module graph (see run.ts). Editing any file it imports re-evaluates this module
// on the next request, which rebuilds the API; `/meta` then reports a new X-Meta-Version.
const projectDir = process.env.PROTOBASE_PROJECT!
// A `realtime.relay` without a url gets the relay protobase dev runs (see dev-relay.ts), whose apps file declares the
// typing of the views' conversation pages.
const loaded = await loadDevConfig(projectDir, JSON.parse(process.env.PROTOBASE_EXTENSIONS ?? '[]'))
const relayExports = loaded.realtime?.relay ? configExports(await projectResources(loaded)) : undefined
const relayApp = { views: relayExports?.views.map((view) => view.toModel()) ?? [], models: relayExports?.resources.map((resource) => resource.toModel()) ?? [] }
const config = await withDevRelay(loaded, process.env.PROTOBASE_DEV_URL!, relayApp)
const database = devDatabase(projectDir)
const { db } = database
// The app as it serves, built from the config: its references loaded, auth and the authenticator made.
const project = await buildProject(config, database)
const { resources, views } = configExports(project.config)

// Once per runtime model, so a database behind the code stops startup with the ways out, read from its record of
// migrations, and a reload whose config needs another part of it, such as the jobs schema, reads the record again.
const store = globalThis as { __protobaseRecordChecked?: string }
const model = builtRuntimeModel(project)
if (store.__protobaseRecordChecked !== modelHash(model)) {
  await checkMigrationRecord(db, model, protobaseVersion)
  store.__protobaseRecordChecked = modelHash(model)
}

// The organization pinned while organizations are off after being on, read with this load's auth.
await project.auth?.pinnedOrganization()

// On every load, since editing the config can add a resource over a table of the auth store, give a resource events or
// history, rollups, derived values or comments, whose objects the record of migrations holds.
if (project.auth) await checkResourcesOutsideAuthStore(db, resources.map((resource) => resource.toModel()), project.auth)
// The built-in assistant's read-only queries run as a role of their own, which must not read the auth store.
if (assistantSettings(project.options?.assistant, process.env)?.kind === 'built-in') await checkQueryRunner(db, project.auth ? authStoreTables(project.auth) : { tables: [], schemas: [] })
// AI fields and actions call the model of PROTOBASE_ASSISTANT_API_KEY, which other commands need not have.
checkAi({ models: resources.map((resource) => resource.toModel()), views: views.map((source) => source.toModel()), assistant: project.options?.assistant, env: process.env })
checkProjectRelay({ ...project, models: resources.map((resource) => resource.toModel()), views: views.map((view) => view.toModel()) }, process.env)

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
const { admin, jobs } = await servedAdmin(project, db, ui, reporter, upgradeWebSocket)

// The project's jobs and the delivery of its events, run in this server unless `--no-jobs` turned them off, on the jobs
// schema the record of migrations checked.
if (process.env.PROTOBASE_DEV_JOBS !== 'false') await devJobs(db, admin.organizationScope, jobs, admin.decryptField, project.mailer, admin.unsubscribe)
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
