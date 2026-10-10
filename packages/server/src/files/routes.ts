import { Hono } from 'hono'
import type { Deps } from '../deps'
import { forbidden } from '../problem'
import type { AdminEnv, Authenticator } from '../types'
import { serveFile } from './download'
import { cleanupFiles } from './runtime'

/**
 * Beside the API, on the app's own host: `GET <systemPath>/files/<provider>/<path>` serves files, and
 * `POST <systemPath>/files:cleanup` runs the scheduled deletes that are due, for an admin (a platform calls it on a schedule).
 */
export const fileRoutes = (deps: Deps, authenticate: Authenticator) => {
  const app = new Hono<AdminEnv>()
  const files = deps.files
  if (!files) return app
  app.get(`${files.path}/:provider/*`, (c) => {
    const provider = c.req.param('provider')
    const path = decodeURIComponent(new URL(c.req.url).pathname.slice(`${files.path}/${provider}/`.length))
    return serveFile(deps, c.req.raw, provider, path)
  })
  app.post(`${files.path}:cleanup`, async (c) => {
    const session = await authenticate(c.req.raw)
    if (!session.user.roles.includes('admin')) throw forbidden('access-denied', 'Only an admin may run the file cleanup')
    return c.json(await cleanupFiles(files, deps.db))
  })
  return app
}
