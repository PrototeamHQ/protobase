import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { createAdaptorServer, upgradeWebSocket } from '@hono/node-server'
import pg from 'pg'
import { backgroundSettled, checkAi, checkJobsSchema, configExports, createFileCleanup, startJobs, type ErrorReporter } from '@protobase/server'
import { servedAdmin } from '../project/served-admin'
import { openAppDatabase } from '../project/pg-db'
import { buildProject, type AppDatabase } from '../config/build-project'
import type { MergedConfig } from '../config/merge-config'
import { apiWebSocketServer } from '../project/api-websocket-server'
import { createServeApp, type ServedSite } from './app'
import { startCleanupTimer } from './cleanup-timer'
import { withClientAddress } from './client-address'
import { serverCloser } from './close-server'
import { checkStartup } from './startup-checks'
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
  // How long `close` lets open requests finish before it drops their connections; tests shorten it.
  closeGraceMs?: number
}

export type RunningServer = { port: number; close: () => Promise<void> }

// Without a host, Node listens on every interface.
const listen = (server: Server, port: number, host?: string) =>
  new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(port, host, () => {
      server.off('error', reject)
      resolve()
    })
  })

/** How long a closing server lets the requests open on it finish, as the jobs' shutdown lets running jobs, in ms. */
export const closeGraceMs = 30_000

// Serves the project until `close`, which stops accepting connections, answers the requests the API holds open waiting,
// such as runners' claims, closes open WebSockets with 1001 (dropping them after 5 seconds), lets open requests finish
// on connections it closes after them (dropping them after `closeGraceMs`), then the work their functions left to
// `waitUntil` and running jobs, and then drains the pool it created. It does not
// start while the auth schema, the change capture of resources with events, the rollup and formula columns, the built-in assistant's query role or the jobs schema is behind, which it only
// reads: the project's migrations change them, before the new version serves. `startupChecks` false skips those reads,
// for a restart of a bundle that already started on this database. With jobs it runs them too, unless
// `runJobs` is off; with file fields it runs their scheduled deletes every `filesCleanupMinutes`, and it prunes the realtime tables (startRealtimePrune). With a mobile section
// it serves the app's files to the mobile app's live updater, composed once here (see servedRelease).
export const startServe = async ({ config, env, openDb = (url) => openAppDatabase(pg, url, env.dbConnections), site, ui, reporter, closeGraceMs: graceMs = closeGraceMs }: ServeOptions): Promise<RunningServer> => {
  if (!env.databaseUrl) throw new Error('No database: set DATABASE_URL')
  const database = openDb(env.databaseUrl)
  const { db } = database
  const startJobsAndListen = async () => {
    // The app, built from its config at serve time: its references loaded, auth and the authenticator made.
    const project = await buildProject(config, database)
    if (env.startupChecks) await checkStartup(project, db)
    const { resources, views } = configExports(project.config)
    if (env.startupChecks) checkAi({ models: resources.map((resource) => resource.toModel()), views: views.map((source) => source.toModel()), assistant: project.options?.assistant, env: process.env })
    const { admin, jobs: definitions } = await servedAdmin(project, db, ui, reporter, upgradeWebSocket)
    if (env.startupChecks && definitions.length > 0) await checkJobsSchema(db)
    const jobs = definitions.length > 0 ? await startJobs({ db, jobs: definitions, work: env.runJobs, decryptField: admin.decryptField, ...(project.mailer && { mailer: project.mailer }), ...(admin.unsubscribe && { unsubscribe: admin.unsubscribe }), onError: (error) => console.error(error) }) : undefined
    const release = project.mobile ? await servedRelease({ site, mobile: project.mobile, issuer: project.auth?.issuer, signingKey: env.mobileSigningKey, serverVersion: protobaseVersion, push: Boolean(project.notifications) }) : undefined
    const mobile = project.mobile && { ...(release && { release }), serverVersion: protobaseVersion }
    const app = createServeApp({ admin, requestLog: env.requestLog, site, ...(jobs && { jobs }), ...(env.drainToken && { drainToken: env.drainToken }), ...(mobile && { mobile }) })
    // WebSockets for `/api/sb/realtime/v1` and the app's functions, upgraded by the app's own routes. Each request names
    // its client in X-Forwarded-For.
    const sockets = apiWebSocketServer()
    const server = createAdaptorServer({ fetch: withClientAddress(app.fetch, env.trustedProxies), overrideGlobalObjects: false, websocket: { server: sockets } }) as Server
    const closeServer = serverCloser(server)
    await listen(server, env.port, env.host).catch(async (error: Error) => {
      await jobs?.stop()
      throw error
    })
    // The old rows of the realtime tables, pruned while this process serves, whether or not a socket is open.
    const prune = admin.startRealtimePrune()
    return { server, closeServer, admin, sockets, jobs, prune, resources, files: project.files }
  }
  const { server, closeServer, admin, sockets, jobs, prune, resources, files } = await startJobsAndListen().catch(async (error: Error) => {
    await db.destroy()
    throw error
  })
  const cleanup = createFileCleanup({ resources, db, ...(files && { files }) })
  const timer = cleanup && env.filesCleanupMinutes > 0 ? startCleanupTimer(cleanup.run, env.filesCleanupMinutes, (error) => console.error(error)) : undefined
  const close = async () => {
    const closed = closeServer(graceMs)
    await admin.stopHolding()
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
