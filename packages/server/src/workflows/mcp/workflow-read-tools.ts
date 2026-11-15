import type { ResourceModel } from '@protobase/schema'
import type { IssueWebhook } from './webhook-tools'
import { listConnectionsTool, type ListConnections } from './connection-tools'
import { checkDefinition, definitionFromParts, definitionWarnings, typeCatalog, type DefinitionParts, type CheckOptions, type TypeEntry } from '@protobase/workflows'
import { refused } from '../../assistant/record-tool-args'
import { defineTool, type ToolContext } from '../../assistant/tools'
import { mergePatch } from './merge-patch'
import { withStepsToCheck } from '../save-hook'
import { connectionHeadersParameter, importedFields } from './import-machine-args'
import { definitionDataOf, definitionFieldsOf, definitionParameters, editParameter, hiddenMergeMessage, hiddenMerges, idOf, idParameter, objectOf, pageSizeOf, textOf } from './workflow-tool-args'
import type { AnswerTaskAs } from '../tasks/answer-as'

const reads = { readOnlyHint: true, openWorldHint: false }
const listed = ['id', 'name', 'description', 'version', 'updated_at']

/**
 * The app's types, which the tools list and check definitions against: `checkWith` checks against the resources it is
 * given, so a check names only what its caller may read.
 */
export type WorkflowCatalog = {
  types: readonly TypeEntry[]
  checkWith: (models: (name: string) => ResourceModel | undefined) => CheckOptions
  /** Issues a workflow's webhook URL as the caller, for `new_webhook_url`. */
  issueWebhook?: IssueWebhook
  /** Answers a waiting Task as the caller, for `send_task_success`, `send_task_failure` and `send_task_heartbeat`. */
  answerTask?: AnswerTaskAs
  /** The caller's own connected accounts, for `list_connections`; none without it. */
  listConnections?: ListConnections
  /** The steps of a run's trace, for `get_workflow_run`. */
  readTrace: TraceReader
}

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
  description: 'Reads one workflow by its id, as JSON ({ workflow, etag }): its name, description, version and definition fields: state_machine, trigger, execution_order, connections and trace. Pass the etag to update_workflow to fail when someone changed it since.',
  parameters: { type: 'object', properties: { id: idParameter }, required: ['id'] },
  annotations: reads,
  run: async (args, context) => {
    const id = idOf(args)
    if (!id) return 'Pass the workflow\'s id as { "id": "<id>" }.'
    return context.records.get('workflows', id).then(({ record, etag }) => JSON.stringify({ workflow: record, etag }), refused)
  },
})

// Imported as create_workflow and update_workflow import it, then checked against the resources the caller may read,
// each with their fields only, so a problem tells them nothing of a resource or field hidden from them: one they
// cannot read is "not a resource of this app".
const checked = async (given: Record<string, unknown>, args: Record<string, unknown>, catalog: WorkflowCatalog, context: ToolContext) => {
  const imported = importedFields(given, args)
  if (imported.problems.length > 0) return JSON.stringify({ valid: false, problems: imported.problems })
  const fields = imported.fields
  const { models } = await context.resources()
  const definition = definitionFromParts(fields as DefinitionParts)
  // As a save checks it: a definition with no steps yet is checked but for that
  const problems = checkDefinition(withStepsToCheck(definition), catalog.checkWith((name) => models.find((model) => model.name === name)))
  if (problems.length > 0) return JSON.stringify({ valid: false, problems })
  const warnings = definitionWarnings(definition)
  return JSON.stringify({ valid: true, ...(warnings.length > 0 && { warnings }) })
}

/** Checks a definition, or a saved one with an edit, without saving anything. */
const validateWorkflowTool = (catalog: WorkflowCatalog) => defineTool({
  name: 'validate_workflow',
  description: 'Checks a definition as a save checks it, and saves nothing: pass its state_machine, with its trigger and execution_order when they are not manual and sequence, or a workflow\'s id with an edit to check that edit of its saved definition fields. A state machine exported from Step Functions is checked as create_workflow imports it, each HTTP task as an app:http step with the header connection_headers names for its connection, its other service tasks refused by name. Returns JSON { valid: true }, or { valid: false, problems }, each problem { state, field, message } naming the state, the field and what was expected. A valid one may come with warnings in the same shape, which a save goes through with, such as a Wait between a Block and a state that reads its result, which may have expired by then.',
  parameters: { type: 'object', properties: { ...definitionParameters, connection_headers: connectionHeadersParameter, id: idParameter, edit: editParameter } },
  annotations: reads,
  run: async (args, context) => {
    const id = idOf(args)
    const edit = objectOf(args.edit)
    const machine = objectOf(args.state_machine)
    // A definition on its own runs by hand unless it says otherwise, as create_workflow saves it
    if (machine && id === undefined && edit === undefined) return checked({ trigger: { manual: {} }, ...definitionDataOf(args), state_machine: machine }, args, catalog, context)
    // An edit comes alone, as update_workflow takes it: whole definition fields beside it are refused, not left out
    if (edit && Object.keys(definitionDataOf(args)).length > 0) return 'Pass either { "state_machine": { ... } } or { "id": "<id>", "edit": { ... } }, with no other definition field beside an edit.'
    // A workflow keeps a state machine and an order: an edit cannot remove them
    const kept = id && edit ? ['state_machine', 'execution_order'].filter((key) => edit[key] === null) : []
    if (kept.length > 0) return JSON.stringify({ valid: false, problems: kept.map((field) => ({ field, message: 'cannot be removed: a workflow keeps one' })) })
    // An edit is checked as update_workflow saves it: a field it removes, the trigger included, is null
    if (!machine && id && edit) {
      return context.records.get('workflows', id).then(({ record }) => {
        const hidden = hiddenMerges(record, edit)
        if (hidden.length > 0) return JSON.stringify({ valid: false, problems: hidden.map((field) => ({ field, message: hiddenMergeMessage })) })
        return checked({ trigger: null, ...(mergePatch(definitionFieldsOf(record), edit) as Record<string, unknown>) }, args, catalog, context)
      }, refused)
    }
    return 'Pass either { "state_machine": { ... } } or { "id": "<id>", "edit": { ... } }.'
  },
})

const runFields = ['id', 'workflow_id', 'version', 'rerun_of', 'block_of', 'block_state', 'started_by', 'status', 'input', 'output', 'error', 'cause', 'resume_at', 'trace', 'trace_file', 'created_at', 'finished_at', 'duration_ms']
const stepFields = ['state', 'scope', 'seq', 'type', 'attempt', 'status', 'input', 'output', 'assigned', 'logs', 'error', 'cause', 'next', 'resumeAt', 'startedAt', 'finishedAt', 'recorded', 'run']

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
      // Read through the run's own access first, `trace_file` included, so the trace of a run the caller may not read,
      // or whose trace a field rule hides, is never read.
      const found = await context.records.get('workflow_runs', id, { fields: runFields }).then(({ record }) => record, refused)
      if (typeof found === 'string') return found
      const { trace_file: _traceFile, ...run } = found
      const state = textOf(args.state)
      const steps = (await readTrace(String(run.id))).filter((step) => !state || step.state === state)
      const offset = offsetOf(args.page_token)
      const end = offset + pageSizeOf(args.page_size, 20, 100)
      const page = steps.slice(offset, end).map((step) => Object.fromEntries(stepFields.flatMap((field) => (field in step ? [[field, step[field]]] : []))))
      return JSON.stringify({ run, steps: page, next_page_token: end < steps.length ? String(end) : '' })
    },
  })

/** The tools that read workflows, their types and runs and the caller's connections, and check definitions. */
export const workflowReadTools = (catalog: WorkflowCatalog) => [listWorkflowTypesTool(catalog), listWorkflowsTool, getWorkflowTool, validateWorkflowTool(catalog), getWorkflowRunTool(catalog.readTrace), listConnectionsTool(catalog.listConnections)]
