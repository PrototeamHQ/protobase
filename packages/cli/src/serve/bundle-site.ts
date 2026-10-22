import path from 'node:path'
import type { BundleLayout } from '../bundle/manifest'
import type { ServedSite } from './app'

// The bundle's own copy of the app, served as a host serves it: the manifest's api paths by the server, the rest from
// its public folder with the SPA fallback, its shell running on the native packages the manifest names.
export const bundleSite = (dir: string, manifest: BundleLayout): ServedSite => ({
  publicDir: path.resolve(dir, manifest.public),
  spa: manifest.spa,
  api: manifest.api,
  ...(manifest.native && { native: manifest.native }),
})
