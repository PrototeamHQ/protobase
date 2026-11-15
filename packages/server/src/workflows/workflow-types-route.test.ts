import { Hono } from 'hono'
import { describe, expect, it } from 'vitest'
import { defineRoles } from '@protobase/schema'
import { workflowResources } from '@protobase/schema/internal'
import { customStepEntry, typeCatalog } from '@protobase/workflows'
import example from '../../../../test-support/workflow-plugin-example'
import type { Deps } from '../deps'
import { createErrorHandler } from '../error-handler'
import { buildRegistry } from '../registry'
import type { AdminEnv } from '../types'
import { workflowTypes } from './workflow-types'
import { workflowTypesRoute } from './workflow-types-route'

const roles = defineRoles<'workflows'>({ builder: ['workflows.*'], reader: ['workflows.read'], other: [] })
const deps = { registry: buildRegistry([workflowResources('workflows').workflows]), accessOptions: { roles }, settingsResources: new Set() } as unknown as Deps
const { types } = workflowTypes([{ plugin: example, source: 'workflow-plugin-example' }])

// The route as the app mounts it, behind a guard that signs the caller in with `role`, in `tenant`
const serve = (role: string, custom?: Parameters<typeof workflowTypesRoute>[2], tenant = '1') => {
  const app = new Hono<AdminEnv>()
  app.onError(createErrorHandler(undefined))
  app.use('*', async (c, next) => {
    c.set('session', { user: { id: '1', roles: [role] }, tenant })
    await next()
  })
  app.route('/', workflowTypesRoute(deps, types, custom))
  return app
}

const invoice = customStepEntry({ name: 'invoice', version: 2, label: 'Invoice', description: null, input: { type: 'object' }, output: { type: 'object' }, error_prefix: 'Invoice', errors: {} })

describe('the workflow types the editor reads', () => {
  it("serves the same list as list_workflow_types, the app's plugins' types included, to whoever reads workflows", async () => {
    for (const role of ['builder', 'reader']) {
      const answer = await serve(role).request('/')
      expect(answer.status).toBe(200)
      const served = await answer.json()
      expect(served).toEqual(JSON.parse(JSON.stringify(typeCatalog(types))))
      expect(served.step_types.map((type: { id: string }) => type.id)).toContain('example:shout')
      expect(served.triggers.map((type: { id: string }) => type.id)).toEqual(['manual', 'app:record', 'app:schedule', 'app:webhook', 'gmail:new_mail', 'example:new_note'])
    }
  })

  it("lists the caller's tenant's custom steps after the app's step types, to whoever reads workflows", async () => {
    const tenants: unknown[] = []
    const custom = async (tenant: unknown) => (tenants.push(tenant), tenant === '1' ? [invoice] : [])
    const served = await (await serve('reader', custom).request('/')).json()
    expect(served.step_types.at(-1)).toEqual(JSON.parse(JSON.stringify(typeCatalog([invoice]).step_types[0])))
    expect((await (await serve('reader', custom, '2').request('/')).json()).step_types.map((type: { id: string }) => type.id)).not.toContain('custom:invoice:2')
    expect(tenants).toEqual(['1', '2'])
    expect((await serve('other', custom).request('/')).status).toBe(404)
  })

  it('refuses a caller who may not read workflows, as reading a workflow does', async () => {
    expect((await serve('other').request('/')).status).toBe(404)
  })
})
