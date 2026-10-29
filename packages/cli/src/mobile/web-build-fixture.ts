import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { manifestFile } from '../bundle/manifest'

/** A deploy bundle's manifest, as protobase build writes it, built at `builtAt` when given. */
export const bundleManifest = (time: { builtAt?: number } = {}) => ({
  version: 3,
  ...time,
  server: 'protobase.config.js',
  public: 'public',
  api: ['/api'],
  spa: 'index.html',
  plugins: [],
  theme: 'protobase.theme.css',
  shell: { protobase: '0.14.2', pluginApi: 1, paths: ['index.html'] },
})

/** A stand-in for protobase build: a bundle of a manifest and an index.html, built at `builtAt` when given. */
export const fakeWebBuild =
  (time: { builtAt?: number } = {}) =>
  async ({ outDir }: { outDir: string }) => {
    mkdirSync(path.join(outDir, 'public'), { recursive: true })
    writeFileSync(path.join(outDir, manifestFile), JSON.stringify(bundleManifest(time)))
    writeFileSync(path.join(outDir, 'public', 'index.html'), '<head></head>')
  }
