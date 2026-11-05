import { checkDefinition, definitionWarnings, type Definition } from '@protobase/workflows'
import { refused } from '../../assistant/record-tool-args'
import { defineTool } from '../../assistant/tools'
import { stepTypeNames } from '../step-types'
import { mergePatch } from './merge-patch'
import { stepTypeCatalog, triggerCatalog, triggerNote } from './type-catalog'
import { definitionParameter, editParameter, idOf, idParameter, objectOf, pageSizeOf, textOf } from './workflow-tool-args'

const reads = { readOnlyHint: true, openWorldHint: false }
const listed = ['id', 'name', 'description', 'version', 'updated_at']

/** The step types and triggers a definition may name, with their arguments, results, errors and run inputs. */
export const listWorkflowTypesTool = defineTool({
  name: 'list_workflow_types',
  description: 'Lists what a workflow definition may name, as JSON ({ step_types, triggers }): each step type a Task names as its Resource, with its Arguments (required or not, and what each takes), its result and the errors it fails with; and each trigger, how the definition holds it and the input a run gets from it.',
  parameters: { type: 'object', properties: {} },
  annotations: reads,
  run: async () => JSON.stringify({ step_types: stepTypeCatalog, triggers: triggerCatalog, note: triggerNote }),
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

const checked = (definition: unknown) => {
  const problems = checkDefinition(definition, { resources: stepTypeNames })
  if (problems.length > 0) return JSON.stringify({ valid: false, problems })
  const warnings = definitionWarnings(definition as Definition)
  return JSON.stringify({ valid: true, ...(warnings.length > 0 && { warnings }) })
}

/** Checks a definition, or a saved one with an edit, without saving anything. */
export const validateWorkflowTool = defineTool({
  name: 'validate_workflow',
  description: 'Checks a definition as a save checks it, and saves nothing: pass a whole definition, or a workflow\'s id with an edit to check that edit of its saved definition. Returns JSON { valid: true }, or { valid: false, problems }, each problem { state, field, message } naming the state, the field and what was expected. A valid definition may come with warnings of the same shape, which a save does not refuse, such as a value fetched once (DoNotRepeat) and read after a Wait, when it may have expired.',
  parameters: { type: 'object', properties: { definition: definitionParameter, id: idParameter, edit: editParameter } },
  annotations: reads,
  run: async (args, context) => {
    const id = idOf(args)
    const edit = objectOf(args.edit)
    if (args.definition !== undefined && id === undefined && edit === undefined) return checked(args.definition)
    if (args.definition === undefined && id && edit) return context.records.get('workflows', id).then(({ record }) => checked(mergePatch(record.definition, edit)), refused)
    return 'Pass either { "definition": { ... } } or { "id": "<id>", "edit": { ... } }.'
  },
})

const runFields = ['id', 'workflow_id', 'version', 'status', 'input', 'output', 'error', 'cause', 'resume_at', 'trace', 'created_at', 'finished_at', 'duration_ms']
const stepFields = ['state', 'scope', 'seq', 'type', 'attempt', 'status', 'input', 'output', 'assigned', 'logs', 'error', 'cause', 'next', 'resumeAt', 'startedAt', 'finishedAt', 'recorded']

/** The steps of a run's trace, in the order they ran. */
export type TraceReader = (runId: string) => Promise<Record<string, unknown>[]>

const offsetOf = (token: unknown) => {
  const offset = Number(textOf(token) ?? 0)
  return Number.isSafeInteger(offset) && offset >= 0 ? offset : 0
}

/** A run with the steps of its trace in the order they ran, a page at a time. */
export const getWorkflowRunTool = (readTrace: TraceReader) =>
  defineTool({
    name: 'get_workflow_run',
    description: "Reads a run by its id, as JSON ({ run, steps, next_page_token }): its status (queued, running, waiting, succeeded or failed), input, output, error and cause, and the steps of its trace in the order they ran, each with its state, scope (empty, or the Map item it ran in), try, status (succeeded, retrying, caught or failed), input, output, assigned variables, logs, error and cause. A run goes on in the background: read it again while it is queued, running or waiting; its trace grows as it goes. A run that keeps no trace (its trace setting none, or failed while it succeeds) lists no steps. Pass state to read only that state's steps; pass next_page_token back as page_token for more steps.",
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
      // Read through the run's own access first, so the trace of a run the caller may not read is never read.
      const run = await context.records.get('workflow_runs', id, { fields: runFields }).then(({ record }) => record, refused)
      if (typeof run === 'string') return run
      const state = textOf(args.state)
      const steps = (await readTrace(String(run.id))).filter((step) => !state || step.state === state)
      const offset = offsetOf(args.page_token)
      const end = offset + pageSizeOf(args.page_size, 20, 100)
      const page = steps.slice(offset, end).map((step) => Object.fromEntries(stepFields.flatMap((field) => (field in step ? [[field, step[field]]] : []))))
      return JSON.stringify({ run, steps: page, next_page_token: end < steps.length ? String(end) : '' })
    },
  })

/** The tools that read workflows, their types and runs, and check definitions. */
export const workflowReadTools = (readTrace: TraceReader) => [listWorkflowTypesTool, listWorkflowsTool, getWorkflowTool, validateWorkflowTool, getWorkflowRunTool(readTrace)]
