import { upgradeWebSocket } from '@hono/node-server'
import { Hono } from 'hono'
import { apiKeySettings, assistantSettings, authStoreTables, checkAi, checkAuthSchema, checkChanges, checkComments, checkComputed, checkQueryRunner, checkWebhooksSchema, configExports, hasUsers } from '@protobase/server'
import { projectIcons } from '../build/app-icons'
import { projectErrorReporter } from '../project/error-reporter'
import { projectAdmin } from '../project/project-admin'
import { devJobs } from './dev-jobs'
import { loadProject, projectDb } from './project'
import { setMissing, supabaseEnv } from './supabase-env'

// Loaded by Vite's SSR module graph (see run.ts). Editing any file it imports re-evaluates this module
// on the next request, which rebuilds the API; `/meta` then reports a new X-Meta-Version.
const projectDir = process.env.PROTOBASE_PROJECT!
const project = await loadProject(projectDir, JSON.parse(process.env.PROTOBASE_EXTENSIONS ?? '[]'))
const db = projectDb(project, projectDir)
const { resources, views } = configExports(project.exports)

if (!project.authenticate) {
  throw new Error('No authenticator: export `authenticate` (and `auth`) from protobase.config.ts; see https://docs.protobase.net/reference/auth/')
}

// Once per server start, so a behind auth schema stops startup with the command that writes its migration.
const store = globalThis as { __protobaseNoUsersShown?: boolean; __protobaseAuthSchemaChecked?: boolean }
if (project.auth && !store.__protobaseAuthSchemaChecked) {
  await checkAuthSchema(project.auth)
  store.__protobaseAuthSchemaChecked = true
}

// On every load, since editing the config can give a resource events or history whose triggers the database lacks, or
// comments whose table it lacks, or rollups and formulas whose columns it lacks.
await checkChanges(db, resources.map((resource) => resource.toModel()), project.events)
await checkComments(db, resources.map((resource) => resource.toModel()))
await checkComputed(db, resources.map((resource) => resource.toModel()))
// The built-in assistant's read-only queries run as a role of their own, which must not read the auth store.
if (assistantSettings(project.options?.assistant, process.env)?.kind === 'built-in') await checkQueryRunner(db, project.auth ? authStoreTables(project.auth) : [])
// AI fields and actions call the model of PROTOBASE_ASSISTANT_API_KEY, which other commands need not have.
checkAi({ models: resources.map((resource) => resource.toModel()), views: views.map((source) => source.toModel()), assistant: project.options?.assistant, env: process.env })
if (project.webhooks) await checkWebhooksSchema(db, project.webhooks)

// Functions moved from Supabase read Supabase's variables, of this app, unless .env sets them.
setMissing(process.env, supabaseEnv({
  url: process.env.PROTOBASE_DEV_URL!,
  databaseUrl: process.env.PROTOBASE_DATABASE_URL!,
  keys: apiKeySettings(project.options?.apiKeys, process.env),
  withAuth: Boolean(project.auth),
}))

// With a DSN set, the API's 500s go to the error tracker too; a crash is the terminal's to show. Its `/api/sb/realtime/v1`
// sockets are upgraded by run.ts's `apiWebSockets`.
const reporter = await projectErrorReporter(project, process.env)
// The plugins come from Vite here, not a bundle; the icons are the project's files, which the dev server answers.
const ui = { plugins: [], fieldTypes: {}, icons: projectIcons(projectDir) }
const { admin, jobs } = projectAdmin({ ...project, authenticate: project.authenticate }, project.exports, db, ui, reporter, upgradeWebSocket)

// The project's jobs and the delivery of its events, run in this server; a behind jobs schema stops startup with the
// command that writes its migration.
await devJobs(db, jobs)

export default new Hono().route('/', admin)

// Without users nobody can sign in; say how to fix that, once per server start.
if (project.auth && !store.__protobaseNoUsersShown) {
  store.__protobaseNoUsersShown = true
  hasUsers(project.auth).then(
    (any) => {
      if (!any) console.log('No users yet. Create the first admin with: protobase users create you@example.com')
    },
    (error: Error) => console.error(`Could not check for users, is the auth schema migrated? ${error.message}`),
  )
}
