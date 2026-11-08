import { Hono } from 'hono'
import { typeCatalog, type TypeEntry } from '@protobase/workflows'
import type { Deps } from '../deps'
import { requestAccess, requireOperation } from '../request-access'
import type { AdminEnv } from '../types'

/**
 * The app's trigger and step types, `GET /` at `workflowTypesPath`, as `list_workflow_types` lists them: the editor
 * draws its menus, forms and check from them. Only for a caller who may read the app's workflows, refused as reading a
 * workflow is.
 */
export const workflowTypesRoute = (deps: Deps, types: readonly TypeEntry[]) => {
  const catalog = typeCatalog(types)
  const app = new Hono<AdminEnv>()
  app.get('/', async (c) => {
    const entry = deps.registry.find('workflows')
    if (!entry) throw new Error('The workflow types are served only in an app with workflows')
    requireOperation(await requestAccess(deps, entry, c.get('session')), 'read')
    return c.json(catalog)
  })
  return app
}
