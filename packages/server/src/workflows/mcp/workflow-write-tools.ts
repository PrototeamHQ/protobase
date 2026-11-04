/**
 * `create_workflow`, `update_workflow` and `run_workflow`: saving and running workflows as the caller, through the
 * resources' access rules and the save check, each after the user approves it in their client, as the record write
 * tools ask. A refused definition comes back with its problems, each naming the state and field.
 */
import { approvalTexts, recordBefore } from '../../assistant/record-before'
import { refused } from '../../assistant/record-tool-args'
import { defineTool } from '../../assistant/tools'
import { createApproval, updateApproval } from '../../assistant/write-prompts'
import { notApproved, onlyNote, outside, type WriteRecordToolsInput } from '../../assistant/write-tool-limits'
import { notFound } from '../../problem'
import type { Row } from '../../types'
import { mergePatch } from './merge-patch'
import { definitionParameter, editParameter, idOf, idParameter, objectOf, textOf, workflowRefused } from './workflow-tool-args'

const writes = { readOnlyHint: false, destructiveHint: false, openWorldHint: false }
const nameParameter = { type: 'string', description: 'A name, 1 to 100 characters.' }
const descriptionParameter = { type: 'string', description: 'What it does, for people; at most 2000 characters.' }

const saved = (record: Row, etag: string) => JSON.stringify({ id: record.id, version: record.version, etag })

/** Creates a workflow once the user approves it; a definition the check refuses saves nothing. */
export const createWorkflowTool = (input: WriteRecordToolsInput = {}) =>
  defineTool({
    name: 'create_workflow',
    description: `Creates a workflow from its name and whole definition, checked as validate_workflow checks it, and returns JSON { id, version, etag }. A definition that does not fit is refused with { error, problems }, each problem naming the state, the field and what was expected; nothing is saved then. The user approves each save in their client first.${onlyNote(input)}`,
    parameters: { type: 'object', properties: { name: nameParameter, description: descriptionParameter, definition: definitionParameter }, required: ['name', 'definition'] },
    annotations: writes,
    run: async (args, context) => {
      const name = textOf(args.name)
      const definition = objectOf(args.definition)
      if (!name || !definition) return 'Pass { "name": "<name>", "definition": { "trigger": ..., "stateMachine": ... } }.'
      const refusal = outside(input, 'workflows')
      if (refusal) return refusal
      const data = { name, definition, ...(textOf(args.description) !== undefined && { description: textOf(args.description) }) }
      const { text, described } = await approvalTexts(context, 'workflows')
      const answer = await context.approve(createApproval(text, described, data))
      if (answer !== 'approved') return notApproved(answer)
      return context.records.create('workflows', data).then(({ record, etag }) => saved(record, etag), workflowRefused)
    },
  })

/** Changes a workflow's definition by an edit or a whole new one, or its name or description, once the user approves it. */
export const updateWorkflowTool = (input: WriteRecordToolsInput = {}) =>
  defineTool({
    name: 'update_workflow',
    description: `Changes a workflow: its definition by a small edit (edit, a JSON Merge Patch of the saved definition) or whole (definition), and its name or description. The changed definition is checked as validate_workflow checks it and saved as the workflow's next version; runs started before keep theirs. Returns JSON { id, version, etag }. A definition that does not fit is refused with { error, problems }, each naming the state, the field and what was expected; nothing is saved then. Pass the etag get_workflow gave to fail when someone changed it since. The user approves each save in their client first.${onlyNote(input)}`,
    parameters: {
      type: 'object',
      properties: { id: idParameter, edit: editParameter, definition: definitionParameter, name: nameParameter, description: descriptionParameter, etag: { type: 'string', description: 'The etag get_workflow gave, to fail when the workflow changed since.' } },
      required: ['id'],
    },
    annotations: writes,
    run: async (args, context) => {
      const id = idOf(args)
      const edit = objectOf(args.edit)
      const whole = objectOf(args.definition)
      if (!id || (edit && whole)) return 'Pass { "id": "<id>" } with either an edit or a whole definition, and any name or description to change.'
      const refusal = outside(input, 'workflows')
      if (refusal) return refusal
      const before = await recordBefore(context, 'workflows', id, textOf(args.etag) || undefined)
      if (typeof before === 'string') return before
      if (edit && !before) return refused(notFound('No workflows with this key that you may read'))
      const definition = edit ? mergePatch(before!.record.definition, edit) : whole
      const data: Row = { ...(definition !== undefined && { definition }), ...(textOf(args.name) !== undefined && { name: textOf(args.name) }), ...(textOf(args.description) !== undefined && { description: textOf(args.description) }) }
      if (Object.keys(data).length === 0) return 'Pass an edit, a definition, a name or a description to change; nothing was saved.'
      const { text, described } = await approvalTexts(context, 'workflows')
      const answer = await context.approve(updateApproval(text, described, id, before?.record ?? {}, data))
      if (answer !== 'approved') return notApproved(answer)
      // Read with the etag it was edited from, so an edit never lands on a definition someone changed meanwhile.
      const etag = textOf(args.etag) || (edit ? before!.etag : undefined)
      return context.records.update('workflows', id, data, { ...(etag && { etag }) }).then(({ record, etag: next }) => saved(record, next), workflowRefused)
    },
  })

/** Starts a run of a workflow with an input once the user approves it. */
export const runWorkflowTool = (input: WriteRecordToolsInput = {}) =>
  defineTool({
    name: 'run_workflow',
    description: `Starts a run of a workflow's current version with an input, which its states read as $states.context.Execution.Input, and returns JSON { run_id, status }. The run goes on in the background, doing what its steps do (requests, mail, record writes) as the workflow's last editor: read it with get_workflow_run until its status is succeeded or failed. The user approves each run in their client first.${onlyNote(input)}`,
    parameters: { type: 'object', properties: { id: idParameter, input: { description: "The run's input, any JSON value, at most 1 MiB; an empty object by default." } }, required: ['id'] },
    annotations: { ...writes, openWorldHint: true },
    run: async (args, context) => {
      const id = idOf(args)
      if (!id) return 'Pass { "id": "<id>", "input": { ... } }.'
      const refusal = outside(input, 'workflow_runs')
      if (refusal) return refusal
      const data = { workflow_id: id, input: args.input ?? {} }
      const { text, described } = await approvalTexts(context, 'workflow_runs')
      const answer = await context.approve(createApproval(text, described, data))
      if (answer !== 'approved') return notApproved(answer)
      return context.records.create('workflow_runs', data).then(({ record }) => JSON.stringify({ run_id: record.id, status: record.status }), refused)
    },
  })

/** The tools that save and run workflows, on the resources `input` allows. */
export const workflowWriteTools = (input: WriteRecordToolsInput = {}) => [createWorkflowTool(input), updateWorkflowTool(input), runWorkflowTool(input)]
