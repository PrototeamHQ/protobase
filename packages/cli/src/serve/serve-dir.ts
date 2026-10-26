import path from 'node:path'
import { readManifest } from '../bundle/manifest'
import { installedShellDir } from '../build/shell'
import { pinnedNative } from '../mobile/pinned-packages'
import { bundleSite } from './bundle-site'
import { servedShell, shellVariable } from './served-shell'
import { serveBundle } from './serve-bundle'

// A bundle folder from `protobase build`, served as a host serves it: the manifest's api paths by the server, the
// rest from its public folder with the SPA fallback; the shell's paths from this server's own shell when it
// has one (`PROTOBASE_SHELL`, else the installed @protobase/ui's).
export const serveBundleDir = async (dir: string, env: Record<string, string | undefined>, out: (text: string) => void) => {
  const manifest = await readManifest(dir)
  const own = env[shellVariable] ? path.resolve(env[shellVariable]) : installedShellDir
  const { shell, note } = await servedShell(own)
  // The server's own shell runs on the native packages of the server's own @protobase/mobile.
  const site = { ...bundleSite(dir, manifest), ...(shell && { shell, native: pinnedNative }) }
  const server = await serveBundle(path.join(dir, manifest.server), env, out, site)
  out(`  app      ${note}\n`)
  return server
}
