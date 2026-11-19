import { builtInFieldTypes } from '@protobase/schema/internal'
import type { FieldWidget } from './field-widget'
import { jsonField } from './json/json-field'
import { lazyWidget } from './lazy-widget'
import { membersField } from './members/members-field'

// The workflow fields load with the first one drawn, and the workflow engine with them, which no other screen needs.
const workflowField = lazyWidget({ of: [...builtInFieldTypes.workflow], wide: true, editor: true, cell: true }, () => import('./workflow/workflow-field').then((module) => module.workflowField))
const workflowRunField = lazyWidget({ of: [...builtInFieldTypes.workflow_run], wide: true, editor: false, cell: true }, () => import('./workflow-run/workflow-run-field').then((module) => module.workflowRunField))
const workflowStatusField = lazyWidget({ of: [...builtInFieldTypes.workflow_status], editor: false, cell: true }, () => import('./workflow-status/workflow-status-field').then((module) => module.workflowStatusField))
const customStepContainerField = lazyWidget({ of: [...builtInFieldTypes.custom_step_container], wide: true, editor: true, cell: true }, () => import('./custom-step-container/custom-step-container-field').then((module) => module.customStepContainerField))
const runnerInstallField = lazyWidget({ of: [...builtInFieldTypes.runner_install], editor: false, cell: true }, () => import('./runner-install/runner-install-field').then((module) => module.runnerInstallField))

/** The field types Protobase brings, which a view chooses by name like a plugin's; a plugin's of the same name wins. */
export const builtInFields: Readonly<Record<string, FieldWidget>> = { json: jsonField, members: membersField, workflow: workflowField, workflow_run: workflowRunField, workflow_status: workflowStatusField, custom_step_container: customStepContainerField, runner_install: runnerInstallField }
