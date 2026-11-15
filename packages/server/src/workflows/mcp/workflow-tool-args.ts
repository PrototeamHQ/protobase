import { problemOf } from '../../error-handler'
import { refused } from '../../assistant/record-tool-args'

export const idParameter = { type: 'string', description: "The workflow's id, as list_workflows gives it." }

/** The fields a workflow's definition is kept in, each a parameter of its own. */
export const definitionParameters = {
  state_machine: {
    type: 'object',
    description:
      'The state machine in the States Language with JSONata, exactly as AWS Step Functions takes and gives one: { "QueryLanguage": "JSONata", "StartAt": ..., "States": { ... } } in sequence order, or { "QueryLanguage": "JSONata", "States": { ... } } with no StartAt, Next or End in data order. A document exported from Step Functions imports, its HTTP tasks as app:http steps.',
  },
  trigger: { type: 'object', description: 'What starts its runs: { "manual": {} } (the default on create), or one trigger type with its input, such as { "app:record": { "resource": "orders" } }.' },
  execution_order: { type: 'string', enum: ['sequence', 'data'], description: 'sequence (the default): each state names its Next, as the States Language orders them. data: a state runs once the states it reads from have ended, states that read nothing of each other run at once, and a Condition decides whether one runs.' },
  connections: { type: ['object', 'null'], description: 'The account each connection <plugin>:<connection> of its types signs in with, by the account id; null clears them.' },
  trace: { type: ['string', 'null'], enum: ['all', 'failed', 'none', null], description: 'Which of its runs keep a trace; the app decides when absent or null.' },
}

/**
 * Where the editor's nodes were moved by hand, which no run reads: a save that changes only it makes no new version.
 */
const positions = { type: 'object', additionalProperties: { type: 'object', properties: { x: { type: 'number' }, y: { type: 'number' } } } }

export const layoutParameter = {
  type: 'object',
  description:
    'Where nodes of the editor\'s graph were moved by hand in each of its views, which no run reads: { "pins": { "<key>": { "x": <number>, "y": <number> } }, "simple": { ... } }, each view its own, so a node moved in one stays where it is in the other; the editor lays out every node a view does not name. A step\'s key is its name, the trigger\'s "$trigger"; in pins only, a Break\'s the value it takes apart (such as "Save.record", or "Save.#break" for a step\'s whole result) and a Make\'s the argument it builds (such as "Save.#make.data"). In a name or field, %, . and a leading # or $ are written %25, %2E, %23 and %24. A position inside a Map or Block is from its top left corner. Other views, and keys of states the workflow no longer has, are dropped; {} lays out every node. A save that changes only the layout makes no new version. Written whole.',
  properties: { pins: positions, simple: positions },
}

/** The layout an MCP call gives, as a workflow record's data: none when it gives no object. */
export const layoutDataOf = (args: Record<string, unknown>) => (objectOf(args.layout) ? { layout: args.layout } : {})

/** The definition's fields an MCP call gives, as a workflow record's data; null clears connections and trace. */
export const definitionDataOf = (args: Record<string, unknown>) =>
  Object.fromEntries(Object.keys(definitionParameters).filter((key) => args[key] !== undefined).map((key) => [key, args[key]]))

/** A workflow record's definition fields alone, which an edit patches. */
export const definitionFieldsOf = (record: Record<string, unknown>) => Object.fromEntries(Object.keys(definitionParameters).filter((key) => record[key] !== undefined).map((key) => [key, record[key]]))

export const editParameter = {
  type: 'object',
  description:
    'A small edit of the saved definition fields as a JSON Merge Patch (RFC 7396) of { state_machine, trigger, execution_order, connections, trace }: only what changes, at its place. An object merges into the object there, null removes a member, and any other value, a list included, replaces it. Such as { "state_machine": { "States": { "Fetch": { "Arguments": { "url": "https://..." } }, "Old": null } } }. A field you may not read cannot be merged into: write it whole, or remove it with null.',
}

export const idOf = (args: Record<string, unknown>) => (typeof args.id === 'string' && args.id ? args.id : undefined)

export const objectOf = (value: unknown) => (typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined)

/**
 * The definition fields an edit merges an object into whose saved value the caller may not read: merged against
 * nothing, the edit would replace all that is saved there. Such a field is written whole, or removed with null.
 */
export const hiddenMerges = (record: Record<string, unknown>, edit: Record<string, unknown>) =>
  Object.keys(definitionParameters).filter((key) => objectOf(edit[key]) !== undefined && record[key] === undefined)

export const hiddenMergeMessage = 'cannot be edited, as you may not read what is saved there: write it whole, or remove it with null'

export const textOf = (value: unknown) => (typeof value === 'string' ? value : undefined)

/** A page size given as a whole number, cut to `max`; `fallback` when none is given. */
export const pageSizeOf = (value: unknown, fallback: number, max: number) => (typeof value === 'number' && Number.isInteger(value) && value > 0 ? Math.min(value, max) : fallback)

/** A definition refused, by the save check or the import, as `{ error, message, problems }`. */
export const invalidWorkflow = (problems: unknown) =>
  JSON.stringify({ error: 'invalid-workflow', message: 'The workflow does not fit the language; nothing was saved. Fix each problem and try again.', problems })

/**
 * A save the workflow check refused, as `{ error, message, problems }`, each problem naming the state and field and
 * what was expected; any other refusal as `refused` words it.
 */
export const workflowRefused = (error: unknown) => {
  const problem = problemOf(error)
  if (problem?.slug === 'invalid-workflow') return invalidWorkflow(problem.extras.problems)
  return refused(error)
}
