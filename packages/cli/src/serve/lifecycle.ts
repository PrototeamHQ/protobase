import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { createAdaptorServer, upgradeWebSocket } from '@hono/node-server'
import pg from 'pg'
import { assistantSettings, authStoreTables, backgroundSettled, checkAi, checkAuthSchema, checkChanges, checkComments, checkComputed, checkJobsSchema, checkNotificationsSchema, checkQueryRunner, checkRealtimeRelay, checkResourcesOutsideAuthStore, checkWebhooksSchema, configExports, createFileCleanup, relayed, startJobs, type ErrorReporter } from '@protobase/server'
import { projectAdmin } from '../project/project-admin'
import { openAppDatabase } from '../project/pg-db'
import { buildProject, type AppDatabase } from '../config/build-project'
import type { MergedConfig } from '../config/merge-config'
import { apiWebSocketServer } from '../project/api-websocket-server'
import { createServeApp, type ServedSite } from './app'
import { startCleanupTimer } from './cleanup-timer'
import { withClientAddress } from './client-address'
import { closeSockets } from './close-sockets'
import { servedRelease } from './mobile-release'
import { protobaseVersion } from '../version/version'
import type { BundleUi } from './bundle-ui'
import type { ServeEnv } from './env'

export type ServeOptions = {
  /** The bundle's config, read with this process's environment (`loadBundle`). */
  config: MergedConfig
  env: ServeEnv
  // How the app's database is opened; tests replace it.
  openDb?: (url: string) => AppDatabase
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

// Serves the project until `close`, which stops accepting connections, closes open WebSockets with 1001 (dropping them
// after 5 seconds), lets open requests finish, then the work their functions left to `waitUntil` and running jobs, and
// then drains the pool it created. It does not
// start while the auth schema, the change capture of resources with events, the rollup and formula columns, the built-in assistant's query role or the jobs schema is behind, which it only
// reads: the project's migrations change them, before the new version serves. `startupChecks` false skips those reads,
// for a restart of a bundle that already started on this database. With jobs it runs them too, unless
// `runJobs` is off; with file fields it runs their scheduled deletes every `filesCleanupMinutes`, and it prunes the realtime tables (startRealtimePrune). With a mobile section
// it serves the app's files to the mobile app's live updater, composed once here (see servedRelease).
export const startServe = async ({ config, env, openDb = (url) => openAppDatabase(pg, url, env.dbConnections), site, ui, reporter }: ServeOptions): Promise<RunningServer> => {
  if (!env.databaseUrl) throw new Error('No database: set DATABASE_URL')
  const database = openDb(env.databaseUrl)
  const { db } = database
  const startJobsAndListen = async () => {
    // The app, built from its config at serve time: its references loaded, auth and the authenticator made.
    const project = await buildProject(config, database)
    if (env.startupChecks && project.auth) await checkAuthSchema(project.auth)
    const { resources, views } = configExports(project.config)
    if (env.startupChecks && project.auth) await checkResourcesOutsideAuthStore(db, resources.map((resource) => resource.toModel()), project.auth)
    if (env.startupChecks) await checkChanges(db, resources.map((resource) => resource.toModel()), project.events)
    if (env.startupChecks) await checkComments(db, resources.map((resource) => resource.toModel()))
    if (env.startupChecks) await checkComputed(db, resources.map((resource) => resource.toModel()))
    if (env.startupChecks && assistantSettings(project.options?.assistant, process.env)?.kind === 'built-in') await checkQueryRunner(db, project.auth ? authStoreTables(project.auth) : [])
    if (env.startupChecks) checkAi({ models: resources.map((resource) => resource.toModel()), views: views.map((source) => source.toModel()), assistant: project.options?.assistant, env: process.env })
    if (env.startupChecks && project.webhooks) await checkWebhooksSchema(db, project.webhooks)
    if (env.startupChecks && relayed(project.realtime)) await checkRealtimeRelay(db)
    if (env.startupChecks && project.notifications) await checkNotificationsSchema(db, project.notifications, project.auth)
    const { admin, jobs: definitions } = projectAdmin(project, db, ui, reporter, upgradeWebSocket)
    if (env.startupChecks && definitions.length > 0) await checkJobsSchema(db)
    const jobs = definitions.length > 0 ? await startJobs({ db, jobs: definitions, work: env.runJobs, ...(project.mailer && { mailer: project.mailer }), onError: (error) => console.error(error) }) : undefined
    const release = project.mobile ? await servedRelease({ site, mobile: project.mobile, issuer: project.auth?.issuer, signingKey: env.mobileSigningKey }) : undefined
    const mobile = project.mobile && { ...(release && { release }), serverVersion: protobaseVersion }
    const app = createServeApp({ admin, requestLog: env.requestLog, site, ...(jobs && { jobs }), ...(env.drainToken && { drainToken: env.drainToken }), ...(mobile && { mobile }) })
    // WebSockets for `/api/sb/realtime/v1` and the app's functions, upgraded by the app's own routes. Each request names
    // its client in X-Forwarded-For.
    const sockets = apiWebSocketServer()
    const server = createAdaptorServer({ fetch: withClientAddress(app.fetch, env.trustedProxies), overrideGlobalObjects: false, websocket: { server: sockets } }) as Server
    await listen(server, env.port).catch(async (error: Error) => {
      await jobs?.stop()
      throw error
    })
    // The old rows of the realtime tables, pruned while this process serves, whether or not a socket is open.
    const prune = admin.startRealtimePrune()
    return { server, sockets, jobs, prune, resources, files: project.files }
  }
  const { server, sockets, jobs, prune, resources, files } = await startJobsAndListen().catch(async (error: Error) => {
    await db.destroy()
    throw error
  })
  const cleanup = createFileCleanup({ resources, db, ...(files && { files }) })
  const timer = cleanup && env.filesCleanupMinutes > 0 ? startCleanupTimer(cleanup.run, env.filesCleanupMinutes, (error) => console.error(error)) : undefined
  const close = async () => {
    const closed = closeServer(server)
    await closeSockets(sockets.clients)
    await closed
    await backgroundSettled()
    await timer?.stop()
    await prune.stop()
    await jobs?.stop()
    await db.destroy()
  }
  return { port: (server.address() as AddressInfo).port, close }
}
