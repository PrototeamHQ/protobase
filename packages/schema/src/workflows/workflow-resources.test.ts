import { describe, expect, it } from 'vitest'
import { workflowResources } from './workflow-resources'

describe('workflowResources', () => {
  it("puts a workflow's enabled version in its editable section, so the admin app turns the workflow on and off", () => {
    const layout = workflowResources('workflows').workflowsView.toModel().layout ?? []
    const editable = layout.flatMap((item) => (item.kind === 'section' ? item.fields : []))
    const readOnly = layout.flatMap((item) => (item.kind === 'sidebar' ? item.fields : []))
    expect(editable).toContain('enabled_version')
    expect(readOnly).not.toContain('enabled_version')
  })

  it('leaves only Workflows in the sidebar, its graph across the page, and opens a run on its workflow', () => {
    const parts = workflowResources('workflows')
    const hidden = [parts.workflowsView, parts.workflowVersionsView, parts.workflowRunsView, parts.workflowTriggersView, parts.workflowResolutionsView].map((view) => view.toModel().nav?.hidden === true)
    expect(hidden).toEqual([false, true, true, true, true])
    const workflows = parts.workflowsView.toModel()
    expect(workflows.recordWidth).toBe('full')
    expect(workflows.layout.find((item) => item.kind === 'section' && item.fields.includes('definition'))).toMatchObject({ width: 'page' })
    expect(parts.workflowRunsView.toModel(parts.workflowRuns.toModel()).recordOpens).toEqual({ kind: 'record', resource: 'workflows', key: '{workflow_id}', run: '{id}' })
  })

  it('lists every workflow under its sidebar entry by name, marked by its run status, and says the status on its page', () => {
    const parts = workflowResources('workflows')
    const workflows = parts.workflowsView.toModel(parts.workflows.toModel())
    expect(workflows.nav?.recent).toEqual({ status: 'run_status', tones: { failing: 'danger', unresolved: 'warning', healthy: 'success' }, orderBy: 'name asc', limit: 20 })
    expect(workflows.fields.run_status).toMatchObject({ widget: { name: 'workflow_status' }, valueColors: { failing: 'red', unresolved: 'amber', healthy: 'green' } })
    expect(workflows.layout.find((item) => item.kind === 'section' && item.fields.includes('run_status'))).toBeDefined()
    expect(workflows.list?.columns).toContain('run_status')
  })

  it('adds storage configurations only with storage, out of the sidebar, linked from each workflow, their keys read by no one', () => {
    expect(workflowResources('workflows')).not.toHaveProperty('storageConfigurations')
    expect(workflowResources('workflows').workflowsView.toModel().actions ?? []).toEqual([])
    const parts = workflowResources('workflows', { storage: true })
    const model = parts.storageConfigurations!.toModel()
    const access = parts.storageConfigurations!.fieldAccess()
    expect(model.explicitGrants).toBe(true)
    expect(parts.storageConfigurationsView!.toModel().nav?.hidden).toBe(true)
    for (const name of ['access_key_id', 'secret_access_key']) {
      const field = model.fields[name]!
      expect(field).toMatchObject({ encrypted: true, sensitive: true })
      expect(access[name]?.read?.({ user: { id: 1, roles: ['admin'] } } as never)).toBe(false)
    }
    expect(parts.workflowsView.toModel().actions).toEqual([expect.objectContaining({ name: 'storage_configurations', run: { kind: 'link', to: { kind: 'list', resource: 'storage_configurations' } } })])
  })
})
