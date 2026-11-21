import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import type { PluginHost } from '@protobase/schema/internal'
import { build } from 'vite'
import { adminAppDir, uiEntry } from '../../src/project/admin-app'

const entryId = '\0protobase-host-offer'
const plugins = path.join(path.dirname(uiEntry), 'plugins')

/**
 * The app's offer to plugins, as `loadPlugin` checks a plugin.json against it: its plugin API, version and
 * host-capabilities.ts, built for the browser from the admin app's folder in production, as `buildShell` builds the app,
 * so React's modules show the names the bundler's reading of them gives the app.
 */
export const builtHostOffer = async (): Promise<PluginHost> => {
  const dir = await mkdtemp(path.join(tmpdir(), 'protobase-host-offer-'))
  const nodeEnv = process.env.NODE_ENV
  process.env.NODE_ENV = 'production'
  try {
    await build({
      configFile: false,
      root: adminAppDir,
      mode: 'production',
      publicDir: false,
      logLevel: 'warn',
      plugins: [
        {
          name: 'protobase-host-offer',
          resolveId: (id) => (id === entryId ? id : undefined),
          load: (id) =>
            id === entryId
              ? `export { hostCapabilities } from ${JSON.stringify(path.join(plugins, 'host-capabilities'))}\nexport { pluginApi, protobaseVersion } from ${JSON.stringify(path.join(plugins, 'plugin-api'))}\n`
              : undefined,
        },
      ],
      build: {
        outDir: dir,
        emptyOutDir: true,
        rolldownOptions: { input: { offer: entryId }, preserveEntrySignatures: 'strict', output: { format: 'es', entryFileNames: '[name].js', codeSplitting: false } },
      },
    })
    const offer = await import(pathToFileURL(path.join(dir, 'offer.js')).href)
    return { api: offer.pluginApi, version: offer.protobaseVersion, ...offer.hostCapabilities }
  } finally {
    if (nodeEnv === undefined) delete process.env.NODE_ENV
    else process.env.NODE_ENV = nodeEnv
    await rm(dir, { recursive: true, force: true })
  }
}
