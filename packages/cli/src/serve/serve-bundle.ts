import path from 'node:path'
import { readManifest } from '../bundle/manifest'
import { projectErrorReporter } from '../project/error-reporter'
import type { ServedSite } from './app'
import { bundleUi } from './bundle-ui'
import { checkBundleManifest } from './bundle-manifest'
import { reportCrashes } from './crash-reports'
import { readServeEnv } from './env'
import { startServe } from './lifecycle'
import { loadBundle } from './load-bundle'
import { closeOnSignals } from './signals'

// Loads the config module of a bundle from `protobase build`, which has its manifest beside it, and serves it until
// SIGTERM or SIGINT; `/meta` names the plugins the manifest lists. With a DSN
// set, its 500s and crashes go to the error tracker.
export const serveBundle = async (file: string, env: Record<string, string | undefined>, out: (text: string) => void, site?: ServedSite) => {
  const serveEnv = readServeEnv(env)
  checkBundleManifest(file)
  const manifest = await readManifest(path.dirname(file))
  const project = await loadBundle(file)
  const reporter = await projectErrorReporter(project, env)
  if (reporter) reportCrashes(reporter)
  const server = await startServe({ project, env: serveEnv, site, ui: bundleUi(manifest), ...(reporter && { reporter }) })
  closeOnSignals(server.close)
  out(`protobase serve listening on port ${server.port}\n`)
  return server
}
