import { describe, expect, it } from 'vitest'
import { builtInFields } from './built-in-fields'
import { customStepContainerField } from './custom-step-container/custom-step-container-field'
import { shapeOf } from './lazy-widget'
import { runnerInstallField } from './runner-install/runner-install-field'
import { workflowField } from './workflow/workflow-field'
import { workflowRunField } from './workflow-run/workflow-run-field'
import { workflowStatusField } from './workflow-status/workflow-status-field'

describe('the built-in field types', () => {
  it('are, before their parts load, what they load: the same storage types, width and parts', () => {
    const loaded = { workflow: workflowField, workflow_run: workflowRunField, workflow_status: workflowStatusField, custom_step_container: customStepContainerField, runner_install: runnerInstallField }
    for (const [name, widget] of Object.entries(loaded)) expect(shapeOf(builtInFields[name]!), name).toEqual(shapeOf(widget))
  })
})
