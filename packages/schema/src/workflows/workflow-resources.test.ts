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

  it('leaves only Workflows in the sidebar, its graph as the page, and opens a run on its workflow', () => {
    const parts = workflowResources('workflows')
    const hidden = [parts.workflowsView, parts.workflowVersionsView, parts.workflowRunsView, parts.workflowTriggersView, parts.workflowResolutionsView].map((view) => view.toModel().nav?.hidden === true)
    expect(hidden).toEqual([false, true, true, true, true])
    const workflows = parts.workflowsView.toModel()
    expect(workflows.recordWidth).toBe('full')
    expect(workflows.record).toEqual({ surface: 'state_machine' })
    expect(workflows.layout.some((item) => item.kind === 'section' && item.fields.includes('definition'))).toBe(false)
    expect(parts.workflowRunsView.toModel(parts.workflowRuns.toModel()).recordOpens).toEqual({ kind: 'record', resource: 'workflows', key: '{{workflow_id}}', run: '{{id}}' })
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
      // Written blind, only by the grant to create or change a configuration.
      for (const mode of ['create', 'update'] as const) {
        expect(access[name]?.[mode]?.({ holds: (capability: string) => capability === `storage_configurations.${mode}` })).toBe(true)
        expect(access[name]?.[mode]?.({ holds: (capability: string) => capability === 'storage_configurations.read' })).toBe(false)
        expect(access[name]?.[mode]?.({})).toBe(false)
      }
    }
    expect(parts.workflowsView.toModel().actions).toEqual([expect.objectContaining({ name: 'storage_configurations', run: { kind: 'link', to: { kind: 'list', resource: 'storage_configurations' } } })])
  })

  it('adds custom steps and their versions only with customSteps, out of the sidebar, linked from each workflow, the name set on create only', () => {
    expect(workflowResources('workflows')).not.toHaveProperty('customSteps')
    const parts = workflowResources('workflows', { customSteps: true })
    const steps = parts.customSteps!.toModel()
    const versions = parts.customStepVersions!.toModel()
    expect([steps.name, versions.name]).toEqual(['workflow_custom_steps', 'workflow_custom_step_versions'])
    expect([steps.explicitGrants, versions.explicitGrants]).toEqual([true, true])
    expect([steps.tenant, versions.tenant]).toEqual(['tenant_id', 'tenant_id'])
    expect([parts.customStepsView!.toModel().nav?.hidden, parts.customStepVersionsView!.toModel().nav?.hidden]).toEqual([true, true])
    expect(steps.fields.version).toMatchObject({ readOnly: true })
    expect(steps.fields.kind).toMatchObject({ type: 'enum', enumValues: ['container'] })
    expect(parts.customStepsView!.toModel(steps).fields.kind?.valueLabels).toEqual({ container: 'Container' })
    // Every Task that calls it names it
    const access = parts.customSteps!.fieldAccess()
    expect(access.name?.update?.({})).toBe(false)
    expect(access.name?.create).toBeUndefined()
    expect(Object.values(versions.fields).every((field) => field.readOnly)).toBe(true)
    expect(parts.workflowsView.toModel().actions).toEqual([
      expect.objectContaining({ name: 'workflow_custom_steps', run: { kind: 'link', to: { kind: 'list', resource: 'workflow_custom_steps' } } }),
      expect.objectContaining({ name: 'workflow_runners', run: { kind: 'link', to: { kind: 'list', resource: 'workflow_runners' } } }),
    ])
    const both = workflowResources('workflows', { storage: true, customSteps: true })
    expect(both.workflowsView.toModel().actions.map((action) => action.name)).toEqual(['storage_configurations', 'workflow_custom_steps', 'workflow_runners'])
  })

  it('adds the runners, granted by name, and their jobs, read-only, with custom steps, both out of the sidebar', () => {
    expect(workflowResources('workflows')).not.toHaveProperty('runners')
    const parts = workflowResources('workflows', { customSteps: true })
    const runners = parts.runners!.toModel()
    const jobs = parts.customStepJobs!.toModel()
    expect([runners.name, jobs.name]).toEqual(['workflow_runners', 'workflow_custom_step_jobs'])
    expect([runners.tenant, jobs.tenant]).toEqual(['tenant_id', 'tenant_id'])
    expect([runners.explicitGrants, jobs.explicitGrants]).toEqual([true, true])
    expect([parts.runnersView!.toModel().nav?.hidden, parts.customStepJobsView!.toModel().nav?.hidden]).toEqual([true, true])
    // Only the server writes what a runner says of itself and how it registered; none of its tokens' hashes is a field
    expect(Object.entries(runners.fields).filter(([, field]) => !field.readOnly).map(([name]) => name)).toEqual(['name', 'labels', 'revoked'])
    expect(Object.values(jobs.fields).every((field) => field.readOnly)).toBe(true)
    expect(Object.keys(jobs.fields)).not.toContain('token')
    expect(Object.keys(jobs.fields)).not.toContain('arguments')
  })
})
