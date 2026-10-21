import { readFile } from 'node:fs/promises'
import { extname, join, normalize } from 'node:path'
import { types } from '../static-server.mjs'

// An origin no server answers: the browser never connects to it, so no socket is open for a host network change to abort.
const base = 'http://files.localhost'

/**
 * Serves the files in `root` to the pages of a Playwright `context` through its request routing rather than a server,
 * and gives the origin they are served at. Chromium aborts every request on a socket in flight when the host's network
 * changes, such as another job on the CI host starting a container network; a routed request never reaches one.
 */
export const routeFiles = async (context, root) => {
  await context.route(`${base}/**`, async (route) => {
    const path = normalize(decodeURIComponent(new URL(route.request().url()).pathname))
    const file = join(root, path.endsWith('/') ? `${path}index.html` : path)
    if (!file.startsWith(root)) return route.fulfill({ status: 403 })
    const body = await readFile(file).catch((error) => (error.code === 'ENOENT' ? null : Promise.reject(error)))
    if (!body) return route.fulfill({ status: 404 })
    return route.fulfill({ body, contentType: types[extname(file)] ?? 'application/octet-stream' })
  })
  return base
}
