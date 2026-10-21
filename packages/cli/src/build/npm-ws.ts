import { createRequire } from 'node:module'
import path from 'node:path'
import type { Plugin } from 'vite'

const require = createRequire(import.meta.url)

/**
 * Bundles npm `ws` for a bare `ws` import. Built on Bun, Vite takes `ws` for a builtin and leaves it out, and the runtime
 * then gets Bun's own shim, which realtime refuses (`apiWebSocketServer`).
 */
export const npmWs = (): Plugin => ({
  name: 'protobase-npm-ws',
  enforce: 'pre',
  resolveId: (id) => (id === 'ws' ? path.join(path.dirname(require.resolve('ws/package.json')), 'wrapper.mjs') : undefined),
})
