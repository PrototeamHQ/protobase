import { existsSync } from 'node:fs'
import type { Server as HttpServer } from 'node:http'
import path from 'node:path'
import type { Plugin } from 'vite'
import { adminAppDir, adminAppMain } from '../project/admin-app'
import type { Extension } from '../project/extensions'
import { checkDatabase } from './check-database'
import { alsoOnIpv6, checkPortFree } from './loopback'
import { authDriftLines } from './auth-drift-lines'
import { loginLine } from './login-line'
import { loadNearestEnvFile } from './env'
import { apiForward } from './api-forward'
import { forkApiChild, type ApiChild } from './api-child'

export type DevOptions = {
  port: number
  envVar: string
  projectDir: string
  // Overrides the admin app of @protobase/ui; used by tests.
  appDir?: string
  // Vite's dependency cache; defaults to node_modules/.vite, which concurrent dev servers share.
  cacheDir?: string
  allowedHosts: string[]
  // Merged before the project's configs, as `protobase build --extend` merges them.
  extensions?: Extension[]
}

const requireAppFiles = (appDir: string) => {
  const missing = ['index.html', adminAppMain].filter((file) => !existsSync(path.join(appDir, file)))
  if (missing.length > 0) {
    throw new Error(`The admin app is missing ${missing.join(', ')} in ${appDir}; \`protobase dev\` serves the app from there`)
  }
}


export const runDev = async (options: DevOptions, out: (text: string) => void) => {
  loadNearestEnvFile(options.projectDir)
  const url = process.env[options.envVar]
  if (!url) throw new Error(`${options.envVar} is not set; add it to .env or pass --env <VARIABLE>`)
  const appDir = options.appDir ?? adminAppDir
  requireAppFiles(appDir)
  await checkDatabase(url, options.projectDir)
  if (options.port !== 0) await checkPortFree(options.port)

  const extensions = options.extensions ?? []
  process.env.PROTOBASE_PROJECT = options.projectDir
  process.env.PROTOBASE_EXTENSIONS = JSON.stringify(extensions)
  process.env.PROTOBASE_DATABASE_URL = url
  // The API runs in a process of its own (api-process.ts), forked before this process loads Vite so it loads
  // @protobase/server while the app's server starts, and started once that one listens; its requests wait for it. An API process that ends while serving, such
  // as on an uncaught error, ends dev too.
  const onApiExit = (code: number) => {
    process.stderr.write(`error: the API process of protobase dev ended with exit code ${code}\n`)
    void server.close().then(() => process.exit(code || 1))
  }
  const apiChild = forkApiChild({ projectDir: options.projectDir, extensions, ...(options.cacheDir && { cacheDir: path.join(options.cacheDir, 'api') }) }, onApiExit)
  let apiReady: (child: ApiChild) => void = () => undefined
  const api = new Promise<ApiChild>((resolve) => {
    apiReady = resolve
  })
  // The API's running jobs finish when the server closes.
  const stopApiOnClose: Plugin = { name: 'protobase-api-process', closeBundle: () => apiChild.stop() }
  const stopApiAndThrow = async (error: Error): Promise<never> => {
    await apiChild.stop()
    throw error
  }
  const { createAppServer } = await import('./app-server')
  const server = await createAppServer({ ...options, appDir, extensions }, [apiForward(() => api.then((child) => child.port)), stopApiOnClose]).catch(stopApiAndThrow)
  const closeAndThrow = async (error: Error): Promise<never> => {
    await server.close()
    throw error
  }
  await server.listen().catch(closeAndThrow)
  const address = server.httpServer?.address()
  const port = typeof address === 'object' && address ? address.port : options.port
  if (server.httpServer) await alsoOnIpv6(server.httpServer as HttpServer, port).catch(closeAndThrow)
  // It loads the API once at its start, so a missing authenticator or a broken config stops startup instead of failing requests.
  const started = await apiChild.start(`http://localhost:${port}`).catch(closeAndThrow)
  apiReady(started)
  const { anyUsers, authDrift } = started
  out(
    `protobase dev ready at http://localhost:${port}\n` +
      `  project  ${options.projectDir}\n  api      http://localhost:${port}/api/v1 (docs at /api/docs)\n` +
      loginLine(anyUsers, process.env.npm_config_user_agent) +
      authDriftLines(authDrift),
  )
  return server
}
