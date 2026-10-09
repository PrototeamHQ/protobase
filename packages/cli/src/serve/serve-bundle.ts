import type { ServedSite } from './app'
import { checkBundleVersion } from './bundle-version'
import { readServeEnv } from './env'
import { startServe } from './lifecycle'
import { loadBundle } from './load-bundle'
import { closeOnSignals } from './signals'

// Loads the config module of a bundle from `protobase build` and serves it until SIGTERM or SIGINT, once the manifest
// beside it shows a Protobase version this runtime serves.
export const serveBundle = async (file: string, env: Record<string, string | undefined>, out: (text: string) => void, site?: ServedSite) => {
  const serveEnv = readServeEnv(env)
  await checkBundleVersion(file)
  const project = await loadBundle(file)
  const server = await startServe({ project, env: serveEnv, site })
  closeOnSignals(server.close)
  out(`protobase serve listening on port ${server.port}\n`)
  return server
}
