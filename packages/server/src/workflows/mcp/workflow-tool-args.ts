import { problemOf } from '../../error-handler'
import { refused } from '../../assistant/record-tool-args'

export const idParameter = { type: 'string', description: "The workflow's id, as list_workflows gives it." }

/** The fields a workflow's definition is kept in, each a parameter of its own. */
export const definitionParameters = {
  state_machine: {
    type: 'object',
    description:
      'The state machine in the States Language with JSONata, exactly as AWS Step Functions takes and gives one: { "QueryLanguage": "JSONata", "StartAt": ..., "States": { ... } } in sequence order, or { "QueryLanguage": "JSONata", "States": { ... } } with no StartAt, Next or End in data order. A document exported from Step Functions imports as it is.',
  },
  trigger: { type: 'object', description: 'What starts its runs: { "manual": {} } (the default on create), or one trigger type with its input, such as { "app:record": { "resource": "orders" } }.' },
  execution_order: { type: 'string', enum: ['sequence', 'data'], description: 'sequence (the default): each state names its Next, as the States Language orders them. data: a state runs once the states it reads from have ended, states that read nothing of each other run at once, and a Condition decides whether one runs.' },
  connections: { type: ['object', 'null'], description: 'The account each connection <plugin>:<connection> of its types signs in with, by the account id; null clears them.' },
  trace: { type: ['string', 'null'], enum: ['all', 'failed', 'none', null], description: 'Which of its runs keep a trace; the app decides when absent or null.' },
}

/** The definition's fields an MCP call gives, as a workflow record's data; null clears connections and trace. */
export const definitionDataOf = (args: Record<string, unknown>) =>
  Object.fromEntries(Object.keys(definitionParameters).filter((key) => args[key] !== undefined).map((key) => [key, args[key]]))

/** A workflow record's definition fields alone, which an edit patches. */
export const definitionFieldsOf = (record: Record<string, unknown>) => Object.fromEntries(Object.keys(definitionParameters).filter((key) => record[key] !== undefined).map((key) => [key, record[key]]))

export const editParameter = {
  type: 'object',
  description:
    'A small edit of the saved definition fields as a JSON Merge Patch (RFC 7396) of { state_machine, trigger, execution_order, connections, trace }: only what changes, at its place. An object merges into the object there, null removes a member, and any other value, a list included, replaces it. Such as { "state_machine": { "States": { "Fetch": { "Arguments": { "url": "https://..." } }, "Old": null } } }.',
}

export const idOf = (args: Record<string, unknown>) => (typeof args.id === 'string' && args.id ? args.id : undefined)

export const objectOf = (value: unknown) => (typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined)

export const textOf = (value: unknown) => (typeof value === 'string' ? value : undefined)

/** A page size given as a whole number, cut to `max`; `fallback` when none is given. */
export const pageSizeOf = (value: unknown, fallback: number, max: number) => (typeof value === 'number' && Number.isInteger(value) && value > 0 ? Math.min(value, max) : fallback)

/**
 * A save the workflow check refused, as `{ error, message, problems }`, each problem naming the state and field and
 * what was expected; any other refusal as `refused` words it.
 */
export const workflowRefused = (error: unknown) => {
  const problem = problemOf(error)
  if (problem?.slug === 'invalid-workflow') return JSON.stringify({ error: problem.slug, message: 'The workflow does not fit the language; nothing was saved. Fix each problem and try again.', problems: problem.extras.problems })
  return refused(error)
}
