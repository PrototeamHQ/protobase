import path from 'node:path'
import { readManifest } from '../bundle/manifest'
import { serveBundle } from './serve-bundle'

// A bundle folder from `protobase build`, served as a host serves it: the manifest's api paths by the server, the
// rest from its public folder with the SPA fallback.
export const serveBundleDir = async (dir: string, env: Record<string, string | undefined>, out: (text: string) => void) => {
  const manifest = await readManifest(dir)
  const site = { publicDir: path.resolve(dir, manifest.public), spa: manifest.spa, api: manifest.api }
  return serveBundle(path.join(dir, manifest.server), env, out, site)
}
