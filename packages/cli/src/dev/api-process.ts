import type { Server } from 'node:http'
import { createAdaptorServer } from '@hono/node-server'
import type { Hono } from 'hono'
import type { WebSocketServer } from 'ws'
import { errorMessage } from '../error-message'
import { moduleFile } from '../module-file'
import { createApiVite, type ApiViteOptions } from './api-vite'
import { devHost } from './loopback'
import { isProjectFile } from './project-files'
import { serverPackage } from './server-package'
import { startupLogger } from './startup-logger'

// The API of `protobase dev`, in a process of its own that api-child.ts forks and run.ts forwards the API's requests and
// sockets to. Every module that uses @protobase/server is loaded through Vite's module graph, which resolves that
// package as `serverPackage` says, for the project's files and the CLI's alike; this file imports none of them.

export type ApiProcessOptions = ApiViteOptions

export type ApiProcessMessage = { ready: { port: number; anyUsers?: boolean } } | { failed: string }

/** What run.ts sends once its server listens: the app's origin, whose /api/sb functions call as SUPABASE_URL. */
export type ApiProcessStart = { start: { devUrl: string } }

const entry = moduleFile('./entry', import.meta.url)
const support = moduleFile('./api-support', import.meta.url)

// Service Restart: realtime-js and the app's own clients reconnect, to the API the edit rebuilt.
const restartCode = 1012

const options: ApiProcessOptions = JSON.parse(process.argv[2]!)
const projectDirs = [options.projectDir, ...options.extensions.map((extension) => extension.dir)]
const logging = startupLogger()
let sockets: WebSocketServer | undefined
let server: Server | undefined
const devUrl = new Promise<string>((resolve) => process.once('message', (message: ApiProcessStart) => resolve(message.start.devUrl)))

const vite = await createApiVite(options, serverPackage(options.projectDir), logging.logger)

// The project's files are loaded with a dynamic import, which Vite does not track as an edge of the entry module. Any
// change inside the project or an extension therefore drops the module graph, so the next request rebuilds the API and
// `/meta` reports a new X-Meta-Version; the open sockets, which hold the API they were opened with, are closed. Vite's
// own hot update hooks are off with HMR, which this process has no page for. The folders are watched whether or not
// they are inside Vite's root, so a new file reloads the API too.
vite.watcher.add(projectDirs)
vite.watcher.on('all', (_event, file) => {
  if (!isProjectFile(projectDirs, file)) return
  vite.environments.ssr.moduleGraph.invalidateAll()
  sockets?.clients.forEach((client) => client.close(restartCode))
})

// An API that fails to load answers 500, and the terminal shows the error with its stack, as Vite's own server did.
const internalError = (error: Error) => {
  vite.ssrFixStacktrace(error)
  vite.config.logger.error(`Internal server error: ${error.message}\n${error.stack ?? ''}`, { error })
  return new Response(`Internal server error: ${error.message}\n`, { status: 500, headers: { 'content-type': 'text/plain; charset=utf-8' } })
}

// The entry module as it is now: Vite evaluates it again after an edit.
const fetch = async (request: Request, env: unknown) => {
  const api = await vite.ssrLoadModule(entry).catch((error: Error) => error)
  if (api instanceof Error) return internalError(api)
  return (api.default as Hono).fetch(request, env as Record<string, unknown>)
}

const listen = (server: Server) =>
  new Promise<number>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, devHost, () => {
      server.off('error', reject)
      resolve((server.address() as { port: number }).port)
    })
  })

// Lets running jobs finish and stops them, then the process: run.ts stops it on SIGTERM, and it stops itself when
// run.ts is gone. Ctrl-C reaches every process of the terminal, so SIGINT is left to run.ts, which stops this one.
const stop = async () => {
  server?.close()
  server?.closeAllConnections()
  await (await vite.ssrLoadModule(support)).stopDevJobs()
  await vite.close()
  process.exit(process.exitCode ?? 0)
}

// Started with the dev server, this loads @protobase/server (through the socket server) while that one starts, and the
// API once it listens.
const start = async () => {
  sockets = (await vite.ssrLoadModule(support)).apiWebSocketServer() as WebSocketServer
  process.env.PROTOBASE_DEV_URL = await devUrl
  // Load the API once now so a missing authenticator or a broken config stops startup instead of failing requests.
  const api = await vite.ssrLoadModule(entry)
  const anyUsers: boolean | undefined = await api.anyUsers()
  logging.started()
  server = createAdaptorServer({ fetch, overrideGlobalObjects: false, websocket: { server: sockets } }) as Server
  const port = await listen(server)
  process.send!({ ready: { port, anyUsers } } satisfies ApiProcessMessage)
}

process.on('SIGINT', () => undefined)
process.on('SIGTERM', () => void stop())
process.on('disconnect', () => void stop())
await start().catch((error: Error) => {
  // run.ts prints the error as the CLI prints any, and stops this process.
  process.exitCode = 1
  process.send!({ failed: errorMessage(error) } satisfies ApiProcessMessage)
})
