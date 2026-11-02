import type { Server as HttpServer } from 'node:http'
import { adminAppDir } from '../project/admin-app'
import type { Extension } from '../project/extensions'
import { requireAppFiles } from './app-files'
import { checkRemoteApi } from './check-remote-api'
import { alsoOnIpv6, checkPortFree } from './loopback'
import { remoteApi } from './remote-api'

export type UiDevOptions = {
  // The origin of the Protobase instance whose API the app uses, from `remoteApiOrigin`.
  api: string
  port: number
  projectDir: string
  // Overrides the admin app of @protobase/ui; used by tests.
  appDir?: string
  cacheDir?: string
  allowedHosts: string[]
  extensions?: Extension[]
}

/**
 * `protobase dev --api`: the admin app with the project's UI, theme and icons, as `runDev` serves it, with its API
 * requests handed to a running instance instead of an API process of its own; no database and no project config are read.
 */
export const runUiDev = async (options: UiDevOptions, out: (text: string) => void) => {
  const appDir = options.appDir ?? adminAppDir
  requireAppFiles(appDir)
  await checkRemoteApi(options.api)
  if (options.port !== 0) await checkPortFree(options.port)

  const { createAppServer } = await import('./app-server')
  const server = await createAppServer({ ...options, appDir, extensions: options.extensions ?? [] }, [remoteApi(options.api)])
  const closeAndThrow = async (error: Error): Promise<never> => {
    await server.close()
    throw error
  }
  await server.listen().catch(closeAndThrow)
  const address = server.httpServer?.address()
  const port = typeof address === 'object' && address ? address.port : options.port
  if (server.httpServer) await alsoOnIpv6(server.httpServer as HttpServer, port).catch(closeAndThrow)
  out(
    `protobase dev ready at http://localhost:${port}\n` +
      `  project  ${options.projectDir} (UI only)\n  api      ${options.api}/api/v1, through http://localhost:${port}/api/v1\n` +
      `  login    sign in as a user of ${options.api}\n`,
  )
  return server
}
