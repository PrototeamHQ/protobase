import { statSync } from 'node:fs'
import path from 'node:path'
import { readManifest } from '../bundle/manifest'
import { bundleSite } from './bundle-site'
import { serveBundle } from './serve-bundle'

// The runtime's `serve`: a bundle folder serves its own copy of the app and its API, a config module its API alone.
export const serveBundlePath = async (bundle: string, env: Record<string, string | undefined>, out: (text: string) => void) => {
  if (!statSync(bundle).isDirectory()) return serveBundle(bundle, env, out)
  const manifest = await readManifest(bundle)
  return serveBundle(path.join(bundle, manifest.server), env, out, bundleSite(bundle, manifest))
}
