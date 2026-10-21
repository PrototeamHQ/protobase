import { createRequire } from 'node:module'
import path from 'node:path'

const require = createRequire(import.meta.url)

/** npm `ws`, loaded by its path: on Bun a bare `ws` import is Bun's own shim, whose sockets realtime refuses. */
export const npmWs: typeof import('ws') = require(path.join(path.dirname(require.resolve('ws/package.json')), 'index.js'))
