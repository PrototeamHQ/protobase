import { checkDefinition, type CheckOptions, type TypeEntry } from '@protobase/workflows'
import { refused } from '../../assistant/record-tool-args'
import { defineTool } from '../../assistant/tools'
import { mergePatch } from './merge-patch'
import { typeCatalog } from './type-catalog'
import { definitionParameter, editParameter, idOf, idParameter, objectOf, pageSizeOf, textOf } from './workflow-tool-args'

const reads = { readOnlyHint: true, openWorldHint: false }
const listed = ['id', 'name', 'description', 'version', 'updated_at']

/** The app's types, which the tools list and check definitions against. */
export type WorkflowCatalog = { types: readonly TypeEntry[]; check: CheckOptions }

/** The step types and triggers a definition may name, with their arguments, results, errors and run inputs. */
const listWorkflowTypesTool = (catalog: WorkflowCatalog) => defineTool({
  name: 'list_workflow_types',
  description: "Lists what a workflow definition may name, as JSON ({ step_types, triggers }): each step type a Task names as its Resource and each trigger, by id, with its label, description, input (the Task's Arguments, or the trigger's input) and output as JSON Schema, the errors a step fails with, the connection it signs in with, and whether this app can run it.",
  parameters: { type: 'object', properties: {} },
  annotations: reads,
  run: async () => JSON.stringify(typeCatalog(catalog.types)),
})

/** The workflows the caller may read, a page at a time, without their definitions. */
export const listWorkflowsTool = defineTool({
  name: 'list_workflows',
  description: 'Lists the workflows you may read, newest change first, as JSON ({ items, next_page_token }), each with its id, name, description and version but not its definition: get_workflow reads that. filter uses AIP-160 on name, such as name = "Daily report"; pass next_page_token back as page_token for the next page.',
  parameters: {
    type: 'object',
    properties: {
      filter: { type: 'string', description: 'Such as name = "Daily report".' },
      page_size: { type: 'integer', minimum: 1, maximum: 100, description: 'Workflows per page, 20 by default.' },
      page_token: { type: 'string', description: 'The next_page_token of the page before.' },
    },
  },
  annotations: reads,
  run: async (args, context) => {
    const params = { fields: listed, order_by: 'updated_at desc', page_size: pageSizeOf(args.page_size, 20, 100), ...(textOf(args.filter) && { filter: textOf(args.filter) }), ...(textOf(args.page_token) && { page_token: textOf(args.page_token) }) }
    return context.records.list('workflows', params).then((page) => JSON.stringify({ items: page.items.map(({ etag: _etag, permissions: _permissions, ...item }) => item), next_page_token: page.next_page_token }), refused)
  },
})

/** One workflow with its definition and the etag an update can pass. */
export const getWorkflowTool = defineTool({
  name: 'get_workflow',
  description: 'Reads one workflow by its id, as JSON ({ workflow, etag }): its name, description, version and whole definition. Pass the etag to update_workflow to fail when someone changed it since.',
  parameters: { type: 'object', properties: { id: idParameter }, required: ['id'] },
  annotations: reads,
  run: async (args, context) => {
    const id = idOf(args)
    if (!id) return 'Pass the workflow\'s id as { "id": "<id>" }.'
    return context.records.get('workflows', id).then(({ record, etag }) => JSON.stringify({ workflow: record, etag }), refused)
  },
})

const checked = (definition: unknown, check: CheckOptions) => {
  const problems = checkDefinition(definition, check)
  return JSON.stringify(problems.length > 0 ? { valid: false, problems } : { valid: true })
}

/** Checks a definition, or a saved one with an edit, without saving anything. */
const validateWorkflowTool = (catalog: WorkflowCatalog) => defineTool({
  name: 'validate_workflow',
  description: 'Checks a definition as a save checks it, and saves nothing: pass a whole definition, or a workflow\'s id with an edit to check that edit of its saved definition. Returns JSON { valid: true }, or { valid: false, problems }, each problem { state, field, message } naming the state, the field and what was expected.',
  parameters: { type: 'object', properties: { definition: definitionParameter, id: idParameter, edit: editParameter } },
  annotations: reads,
  run: async (args, context) => {
    const id = idOf(args)
    const edit = objectOf(args.edit)
    if (args.definition !== undefined && id === undefined && edit === undefined) return checked(args.definition, catalog.check)
    if (args.definition === undefined && id && edit) return context.records.get('workflows', id).then(({ record }) => checked(mergePatch(record.definition, edit), catalog.check), refused)
    return 'Pass either { "definition": { ... } } or { "id": "<id>", "edit": { ... } }.'
  },
})

const runFields = ['id', 'workflow_id', 'version', 'rerun_of', 'started_by', 'status', 'input', 'output', 'error', 'cause', 'resume_at', 'created_at', 'finished_at', 'duration_ms']
const stepFields = ['state', 'scope', 'seq', 'type', 'attempt', 'status', 'input', 'output', 'assigned', 'logs', 'error', 'cause', 'next', 'resume_at', 'duration_ms']

/** A run with its steps in the order they ran, a page at a time. */
export const getWorkflowRunTool = defineTool({
  name: 'get_workflow_run',
  description: 'Reads a run by its id, as JSON ({ run, steps, next_page_token }): its status (queued, running, waiting, succeeded or failed), input, output, error and cause, and its steps in the order they ran, each with its state, scope (empty, or the Map item it ran in), try, status (succeeded, retrying, caught or failed), input, output, assigned variables, logs, error and cause. A run goes on in the background: read it again while it is queued, running or waiting. Pass state to read only that state\'s steps; pass next_page_token back as page_token for more steps.',
  parameters: {
    type: 'object',
    properties: {
      run_id: { type: 'string', description: "The run's id, as run_workflow gives it." },
      state: { type: 'string', description: "Only this state's steps." },
      page_size: { type: 'integer', minimum: 1, maximum: 100, description: 'Steps per page, 20 by default.' },
      page_token: { type: 'string', description: 'The next_page_token of the page before.' },
    },
    required: ['run_id'],
  },
  annotations: reads,
  run: async (args, context) => {
    const id = textOf(args.run_id)
    if (!id) return 'Pass the run\'s id as { "run_id": "<id>" }.'
    const run = await context.records.get('workflow_runs', id, { fields: runFields }).then(({ record }) => record, refused)
    if (typeof run === 'string') return run
    const state = textOf(args.state)
    const filter = `run_id = ${JSON.stringify(id)}${state ? ` AND state = ${JSON.stringify(state)}` : ''}`
    const params = { filter, fields: stepFields, order_by: 'id', page_size: pageSizeOf(args.page_size, 20, 100), ...(textOf(args.page_token) && { page_token: textOf(args.page_token) }) }
    return context.records.list('workflow_steps', params).then((page) => JSON.stringify({ run, steps: page.items.map(({ etag: _etag, permissions: _permissions, ...step }) => step), next_page_token: page.next_page_token }), refused)
  },
})

/** The tools that read workflows, their types and runs, and check definitions. */
export const workflowReadTools = (catalog: WorkflowCatalog) => [listWorkflowTypesTool(catalog), listWorkflowsTool, getWorkflowTool, validateWorkflowTool(catalog), getWorkflowRunTool]
