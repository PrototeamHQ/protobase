import { Hono } from 'hono'
import { checkAuthSchema, checkChanges, checkWebhooksSchema, configExports, hasUsers } from '@protobase/server'
import { projectErrorReporter } from '../project/error-reporter'
import { projectAdmin } from '../project/project-admin'
import { devJobs } from './dev-jobs'
import { loadProject, projectDb } from './project'

// Loaded by Vite's SSR module graph (see run.ts). Editing any file it imports re-evaluates this module
// on the next request, which rebuilds the API; `/meta` then reports a new X-Meta-Version.
const projectDir = process.env.PROTOBASE_PROJECT!
const project = await loadProject(projectDir, JSON.parse(process.env.PROTOBASE_EXTENSIONS ?? '[]'))
const db = projectDb(project, projectDir)
const { resources } = configExports(project.exports)

if (!project.authenticate) {
  throw new Error('No authenticator: export `authenticate` (and `auth`) from protobase.config.ts; see https://docs.protobase.net/reference/auth/')
}

// Once per server start, so a behind auth schema stops startup with the command that writes its migration.
const store = globalThis as { __protobaseNoUsersShown?: boolean; __protobaseAuthSchemaChecked?: boolean }
if (project.auth && !store.__protobaseAuthSchemaChecked) {
  await checkAuthSchema(project.auth)
  store.__protobaseAuthSchemaChecked = true
}

// On every load, since editing the config can give a resource events whose triggers the database lacks.
await checkChanges(db, resources.map((resource) => resource.toModel()), project.events)
if (project.webhooks) await checkWebhooksSchema(db, project.webhooks)

// With a DSN set, the API's 500s go to the error tracker too; a crash is the terminal's to show.
const reporter = await projectErrorReporter(project, process.env)
const { admin, jobs } = projectAdmin({ ...project, authenticate: project.authenticate }, project.exports, db, undefined, reporter)

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
