import { problemOf } from '../../error-handler'
import { refused } from '../../assistant/record-tool-args'

export const idParameter = { type: 'string', description: "The workflow's id, as list_workflows gives it." }

export const definitionParameter = {
  type: 'object',
  description: 'The whole definition: { "trigger": { ... }, "stateMachine": { "QueryLanguage": "JSONata", "StartAt": ..., "States": { ... } } }, as the server\'s instructions describe it.',
}

export const editParameter = {
  type: 'object',
  description:
    'A small edit of the saved definition as a JSON Merge Patch (RFC 7396): only what changes, at its place in the document. An object merges into the object there, null removes a member, and any other value, a list included, replaces it. Such as { "stateMachine": { "States": { "Fetch": { "Arguments": { "url": "https://..." } }, "Old": null } } }.',
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
  if (problem?.slug === 'invalid-workflow') return JSON.stringify({ error: problem.slug, message: 'The definition does not fit the language; nothing was saved. Fix each problem and try again.', problems: problem.extras.problems })
  return refused(error)
}
