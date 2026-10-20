import type { Hono } from 'hono'
import { cors } from 'hono/cors'
import { authBasePath } from '../auth-base-path'
import type { AdminAuth } from '../create-auth'
import { oauthWellKnownPaths } from '../origins'
import type { AdminEnv } from '../../types'

// What an MCP client calls from anywhere, without cookies: discovery, registration and the token endpoint. Authorize,
// continue and consent go with the person's session cookie, so they get no CORS and keep Better Auth's origin check.
const openPaths = [...oauthWellKnownPaths.flatMap((path) => [path, `${path}/*`]), `${authBasePath}/oauth2/register`, `${authBasePath}/oauth2/token`]

/**
 * Routes MCP clients find the app's OAuth provider by: the two discovery documents, which Better Auth answers outside
 * its base path, and open CORS on them and on registration and the token endpoint, before the auth route answers.
 */
export const mcpDiscovery = (app: Hono<AdminEnv>, auth: AdminAuth) => {
  for (const path of openPaths) app.use(path, cors({ origin: '*' }))
  // Hono answers HEAD through GET.
  for (const path of oauthWellKnownPaths) app.get(path, (c) => auth.handler(c.req.raw)).get(`${path}/*`, (c) => auth.handler(c.req.raw))
}
