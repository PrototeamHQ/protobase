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
    const hidden = [parts.workflowsView, parts.workflowVersionsView, parts.workflowRunsView, parts.workflowTriggersView].map((view) => view.toModel().nav?.hidden === true)
    expect(hidden).toEqual([false, true, true, true])
    const workflows = parts.workflowsView.toModel()
    expect(workflows.recordWidth).toBe('full')
    expect(workflows.layout.find((item) => item.kind === 'section' && item.fields.includes('definition'))).toMatchObject({ width: 'page' })
    expect(parts.workflowRunsView.toModel(parts.workflowRuns.toModel()).recordOpens).toEqual({ kind: 'record', resource: 'workflows', key: '{workflow_id}', run: '{id}' })
  })
})
