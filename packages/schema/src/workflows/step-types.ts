/**
 * How a step type's argument is written: `text`, one line, which may be an expression; `choice`, one of `options`;
 * `json`, any JSON value or an expression, such as an object of field values.
 */
export type StepInputKind = 'text' | 'choice' | 'json'

/** An argument of a step type: its name in `Arguments`, how it is written, and whether a save needs it. */
export type StepInput = { name: string; kind: StepInputKind; required?: boolean; options?: readonly string[] }

const text = (name: string, required = false): StepInput => ({ name, kind: 'text', ...(required && { required }) })
const json = (name: string, required = false): StepInput => ({ name, kind: 'json', ...(required && { required }) })
const choice = (name: string, options: readonly string[]): StepInput => ({ name, kind: 'choice', options })

/**
 * The step types a workflow's Task names as its `Resource`, each with its arguments: the server runs them, a save
 * refuses a Task without a required one, and the editor draws a form of them.
 */
export const workflowStepTypes = {
  'app:http': [text('url', true), choice('method', ['GET', 'POST', 'PUT', 'PATCH', 'DELETE']), json('headers'), json('query'), json('body'), choice('response', ['json', 'text', 'file'])],
  'app:records.create': [text('resource', true), json('data', true)],
  'app:records.update': [text('resource', true), json('key', true), json('data', true)],
  'app:records.get': [text('resource', true), json('key', true)],
  'app:records.list': [text('resource', true), text('filter'), text('order_by'), json('limit')],
  'app:mail.send': [json('to', true), text('subject', true), text('text', true), text('html'), json('attachments')],
  'app:piece': [text('piece', true), text('action', true), text('connection'), json('props')],
} as const satisfies Record<string, readonly StepInput[]>

export type WorkflowStepType = keyof typeof workflowStepTypes

/** The names of the arguments each step type needs, as the definition check takes them. */
export const requiredStepInputs = Object.fromEntries(
  Object.entries(workflowStepTypes).map(([type, inputs]) => [type, inputs.filter((input: StepInput) => input.required).map((input) => input.name)]),
) as Record<WorkflowStepType, string[]>

/**
 * The trigger types the editor offers beside `manual`, each with its input: a save refuses one without a required field,
 * and the editor draws a form of them.
 */
export const workflowTriggerTypes = {
  'app:record': [text('resource', true), text('when'), json('key')],
} as const satisfies Record<string, readonly StepInput[]>

export type WorkflowTriggerType = keyof typeof workflowTriggerTypes
