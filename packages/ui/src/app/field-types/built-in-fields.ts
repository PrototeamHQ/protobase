import type { FieldWidget } from './field-widget'
import { jsonField } from './json/json-field'
import { membersField } from './members/members-field'
import { workflowField } from './workflow/workflow-field'
import { workflowRunField } from './workflow-run/workflow-run-field'
import { workflowStatusField } from './workflow-status/workflow-status-field'

/** The field types Protobase brings, which a view chooses by name like a plugin's; a plugin's of the same name wins. */
export const builtInFields: Readonly<Record<string, FieldWidget>> = { json: jsonField, members: membersField, workflow: workflowField, workflow_run: workflowRunField, workflow_status: workflowStatusField }
