import path from 'node:path'
import { readManifest } from '../bundle/manifest'
import { installedShellDir } from '../build/shell'
import { bundleSite } from './bundle-site'
import { servedShell, shellVariable } from './served-shell'
import { serveBundle } from './serve-bundle'

// A bundle folder from `protobase build`, served as a host serves it: the manifest's api paths by the server, the
// rest from its public folder with the SPA fallback; the shell's paths from this server's own shell when it
// has one (`PROTOBASE_SHELL`, else the installed @protobase/ui's).
export const serveBundleDir = async (dir: string, env: Record<string, string | undefined>, out: (text: string) => void) => {
  const manifest = await readManifest(dir)
  const own = env[shellVariable] ? path.resolve(env[shellVariable]) : installedShellDir
  const { shell, native, note } = await servedShell(own)
  const bundled = bundleSite(dir, manifest)
  // The server's own shell runs on the native packages its protobase.shell.json names, not the bundle's copy's.
  const { native: _, ...ownSite } = bundled
  const site = shell ? { ...ownSite, shell, ...(native && { native }) } : bundled
  const server = await serveBundle(path.join(dir, manifest.server), env, out, site)
  out(`  app      ${note}\n`)
  return server
}
