import { Scalar } from '@scalar/hono-api-reference'
import { Hono } from 'hono'
import type { Deps } from '../deps'
import { apiTitle, openApiDocument } from '../openapi/document'
import { nestedListPaths } from '../openapi/nested-list-paths'
import { requestAccess } from '../request-access'
import type { AdminEnv } from '../types'

/**
 * The OpenAPI document and the Scalar reference, both titled with the app's name. Both need a token: the document lists
 * what the caller may see and do.
 */
export const docsRoutes = (deps: Deps, appName: string) => {
  const app = new Hono<AdminEnv>()
  app.get('/openapi.json', async (c) => {
    const accesses = await Promise.all(deps.registry.entries.map((entry) => requestAccess(deps, entry, c.get('session'))))
    const visible = accesses.filter((access) => Object.values(access.resolved.operations).some(Boolean))
    return c.json(openApiDocument(visible, deps.basePath, appName, await nestedListPaths(visible)))
  })
  // Relative to `/docs`, like the document's servers, so the reference works on every host and prefix.
  app.get('/docs', Scalar({ url: 'openapi.json', pageTitle: apiTitle(appName) }))
  return app
}
