import { Hono } from 'hono'
import { typeCatalog, withCustomSteps, type TypeEntry } from '@protobase/workflows'
import type { Deps } from '../deps'
import { requestAccess, requireOperation } from '../request-access'
import type { AdminEnv } from '../types'

/**
 * The app's trigger and step types, `GET /` at `workflowTypesPath`, as `list_workflow_types` lists them: the editor
 * draws its menus, forms and check from them. Only for a caller who may read the app's workflows, refused as reading a
 * workflow is. With `custom`, the caller's tenant's custom steps follow the app's types.
 */
export const workflowTypesRoute = (deps: Deps, types: readonly TypeEntry[], custom?: (tenant: unknown) => Promise<TypeEntry[]>) => {
  const catalog = typeCatalog(types)
  const app = new Hono<AdminEnv>()
  app.get('/', async (c) => {
    const entry = deps.registry.find('workflows')
    if (!entry) throw new Error('The workflow types are served only in an app with workflows')
    const session = c.get('session')
    requireOperation(await requestAccess(deps, entry, session), 'read')
    if (!custom) return c.json(catalog)
    return c.json(typeCatalog(withCustomSteps(await custom(session.tenant)).types(types)))
  })
  return app
}
