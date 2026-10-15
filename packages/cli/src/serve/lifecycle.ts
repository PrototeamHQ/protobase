import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { createAdaptorServer } from '@hono/node-server'
import pg from 'pg'
import type { Db } from '@protobase/query'
import { checkAuthSchema, checkChanges, checkJobsSchema, checkWebhooksSchema, configExports, createFileCleanup, startJobs, type ErrorReporter } from '@protobase/server'
import { projectAdmin } from '../project/project-admin'
import { createPgDb } from '../project/pg-db'
import { createServeApp, type ServedSite } from './app'
import { startCleanupTimer } from './cleanup-timer'
import type { BundleUi } from './bundle-ui'
import type { ServeEnv } from './env'
import type { ServedProject } from './load-bundle'

export type ServeOptions = {
  project: ServedProject
  env: ServeEnv
  // How the pool is created when the project exports no `db`; tests replace it.
  createDb?: (url: string) => Db
  // The bundle's UI, for `protobase serve <dir>`; the runtime on the host serves the API alone.
  site?: ServedSite
  // The plugins the bundle carries, which `/meta` names.
  ui?: BundleUi
  // Where the API's 500s go besides the console.
  reporter?: ErrorReporter
}

export type RunningServer = { port: number; close: () => Promise<void> }

const listen = (server: Server, port: number) =>
  new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(port, () => {
      server.off('error', reject)
      resolve()
    })
  })

const closeServer = (server: Server) =>
  new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())))

// Serves the project until `close`, which stops accepting connections, lets open requests finish, lets running jobs
// finish and then drains the pool it created. A `db` exported by the project stays the project's to close. It does not
// start while the auth schema, the change capture of resources with events or the jobs schema is behind, which it only
// reads: the project's migrations change them, before the new version serves. `startupChecks` false skips those reads,
// for a restart of a bundle that already started on this database. With jobs it runs them too, unless
// `runJobs` is off; with file fields it runs their scheduled deletes every `filesCleanupMinutes`.
export const startServe = async ({ project, env, createDb = (url) => createPgDb(pg, url), site, ui, reporter }: ServeOptions): Promise<RunningServer> => {
  if (!project.db && !env.databaseUrl) throw new Error('No database: set DATABASE_URL or export `db` from protobase.config.ts')
  if (env.startupChecks && project.auth) await checkAuthSchema(project.auth)
  const ownDb = project.db ? undefined : createDb(env.databaseUrl!)
  const db = project.db ?? ownDb!
  const { resources } = configExports(project.config)
  const startJobsAndListen = async () => {
    if (env.startupChecks) await checkChanges(db, resources.map((resource) => resource.toModel()), project.events)
    if (env.startupChecks && project.webhooks) await checkWebhooksSchema(db, project.webhooks)
    const { admin, jobs: definitions } = projectAdmin(project, project.config, db, ui, reporter)
    if (env.startupChecks && definitions.length > 0) await checkJobsSchema(db)
    const jobs = definitions.length > 0 ? await startJobs({ db, jobs: definitions, work: env.runJobs, onError: (error) => console.error(error) }) : undefined
    const app = createServeApp({ admin, requestLog: env.requestLog, site, ...(jobs && { jobs }), ...(env.drainToken && { drainToken: env.drainToken }) })
    const server = createAdaptorServer({ fetch: app.fetch, overrideGlobalObjects: false }) as Server
    await listen(server, env.port).catch(async (error: Error) => {
      await jobs?.stop()
      throw error
    })
    return { server, jobs }
  }
  const { server, jobs } = await startJobsAndListen().catch(async (error: Error) => {
    await ownDb?.destroy()
    throw error
  })
  const cleanup = createFileCleanup({ resources, db, ...(project.files && { files: project.files }) })
  const timer = cleanup && env.filesCleanupMinutes > 0 ? startCleanupTimer(cleanup.run, env.filesCleanupMinutes, (error) => console.error(error)) : undefined
  const close = async () => {
    await closeServer(server)
    await timer?.stop()
    await jobs?.stop()
    await ownDb?.destroy()
  }
  return { port: (server.address() as AddressInfo).port, close }
}
