import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { createAdaptorServer } from '@hono/node-server'
import pg from 'pg'
import type { Db } from '@protobase/query'
import { checkAuthSchema, configExports, createFileCleanup } from '@protobase/server'
import { createPgDb } from '../project/pg-db'
import { createServeApp, type ServedSite } from './app'
import { startCleanupTimer } from './cleanup-timer'
import type { ServeEnv } from './env'
import type { ServedProject } from './load-bundle'

export type ServeOptions = {
  project: ServedProject
  env: ServeEnv
  // How the pool is created when the project exports no `db`; tests replace it.
  createDb?: (url: string) => Db
  // The bundle's UI, for `protobase serve <dir>`; the runtime on the host serves the API alone.
  site?: ServedSite
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

// Serves the project until `close`, which stops accepting connections, lets open requests finish and then drains
// the pool it created. A `db` exported by the project stays the project's to close. It does not start while the auth
// schema is behind, which it only reads: the project's migrations change it, before the new version serves. With file
// fields it runs their scheduled deletes every `filesCleanupMinutes`.
export const startServe = async ({ project, env, createDb = (url) => createPgDb(pg, url), site }: ServeOptions): Promise<RunningServer> => {
  if (!project.db && !env.databaseUrl) throw new Error('No database: set DATABASE_URL or export `db` from protobase.config.ts')
  if (project.auth) await checkAuthSchema(project.auth)
  const ownDb = project.db ? undefined : createDb(env.databaseUrl!)
  const db = project.db ?? ownDb!
  const app = createServeApp({ project, db, requestLog: env.requestLog, site })
  const server = createAdaptorServer({ fetch: app.fetch }) as Server
  await listen(server, env.port).catch(async (error: Error) => {
    await ownDb?.destroy()
    throw error
  })
  const cleanup = createFileCleanup({ resources: configExports(project.config).resources, db, ...(project.files && { files: project.files }) })
  const timer = cleanup && env.filesCleanupMinutes > 0 ? startCleanupTimer(cleanup.run, env.filesCleanupMinutes, (error) => console.error(error)) : undefined
  const close = async () => {
    await closeServer(server)
    await timer?.stop()
    await ownDb?.destroy()
  }
  return { port: (server.address() as AddressInfo).port, close }
}
