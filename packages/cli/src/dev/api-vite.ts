import { createServer, type Logger } from 'vite'
import { layoutCheck } from '../build/layout-check'
import { extensionImports, type Extension } from '../project/extensions'
import type { ServerPackage } from './server-package'

export type ApiViteOptions = { projectDir: string; extensions: Extension[]; cacheDir?: string }

/**
 * The Vite server the API process loads the API through: no page, no HMR socket and no dependency optimisation; the
 * project's server-side files transformed as the dev server's page transforms them, and the `dedupe` packages of
 * `resolution`, @protobase/server among them, resolved from its root for every importer, the CLI's files included.
 */
export const createApiVite = (options: ApiViteOptions, resolution: ServerPackage, logger?: Logger) =>
  createServer({
    root: resolution.root,
    configFile: false,
    ...(logger && { customLogger: logger }),
    ...(options.cacheDir && { cacheDir: options.cacheDir }),
    appType: 'custom',
    server: { middlewareMode: true, hmr: false, ws: false },
    optimizeDeps: { noDiscovery: true, include: [] },
    resolve: { dedupe: resolution.dedupe },
    // JSX as @vitejs/plugin-react sets it for the dev server's page, whatever the project's tsconfig says; the plugin's
    // other parts are for the page.
    oxc: { jsx: { runtime: 'automatic', importSource: 'react' } },
    plugins: [extensionImports(options.projectDir, options.extensions), layoutCheck()],
  })
