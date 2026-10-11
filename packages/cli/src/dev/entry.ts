import { Hono } from 'hono'
import { checkAuthSchema, checkChanges, configExports, createAdmin, hasUsers, jobDefinitions } from '@protobase/server'
import { devJobs } from './dev-jobs'
import { loadProject, projectDb } from './project'

// Loaded by Vite's SSR module graph (see run.ts). Editing any file it imports re-evaluates this module
// on the next request, which rebuilds the API; `/meta` then reports a new X-Meta-Version.
const projectDir = process.env.PROTOBASE_PROJECT!
const project = await loadProject(projectDir, JSON.parse(process.env.PROTOBASE_EXTENSIONS ?? '[]'))
const db = projectDb(project, projectDir)
const { resources, views, pages, userMenu } = configExports(project.exports)

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

// The project's jobs, run in this server; a behind jobs schema stops startup with the command that writes its migration.
await devJobs(db, jobDefinitions(project.jobs ?? {}))

const admin = createAdmin({
  resources,
  views,
  pages,
  ...(userMenu && { userMenu }),
  db,
  authenticate: project.authenticate,
  ...(project.auth && { auth: project.auth }),
  ...(project.functions && { functions: project.functions }),
  ...(project.files && { files: project.files }),
  ...(project.events && { events: project.events }),
  options: { onUnhandledError: (error) => console.error(error), ...project.options },
})

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
