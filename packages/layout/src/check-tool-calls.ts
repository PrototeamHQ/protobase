import type { ResourceModel, ToolCallFields } from '@protobase/schema'
import { choiceFilterProblems } from './check-param-filters'
import { pathFindings, type PathCheckInput } from './check-paths'
import { timeProblems } from './check-time'
import type { SelectInputProps } from './page-params'
import { sampledFilterErrors } from './sampled-filter'
import type { Scope } from './walk'

/** The tool calls a thread draws between its messages: records of `resource`, by the fields it reads of each, narrowed by `filter` on a page. */
export type ToolCallSource = ToolCallFields & { resource: string; filter?: string }

/** The values of a tool call's `status` that give it a mark; any other value, or none, draws no mark. */
export const toolCallStates = ['done', 'error', 'running'] as const

export type ToolCallState = (typeof toolCallStates)[number]

const required = ['name', 'time', 'status'] as const
const shown = ['input', 'result', 'error'] as const

const fieldOf = (model: ResourceModel, name: string) => (Object.hasOwn(model.fields, name) ? model.fields[name] : undefined)

/** The fields of `source` that name a field, the ones each call needs first. */
const namedFields = (source: ToolCallSource) => [...required, ...shown].flatMap((prop) => (source[prop] === undefined ? [] : [[prop, source[prop]] as const]))

// The name and the error read as text, the status as one of the states; the input and result show as JSON whatever their type
const typeProblems = (source: ToolCallSource, model: ResourceModel): string[] => {
  const name = fieldOf(model, source.name)!
  const status = fieldOf(model, source.status)!
  const error = source.error === undefined ? undefined : fieldOf(model, source.error)!
  return [
    ...(name.type === 'text' ? [] : [`name: "${source.name}" is ${name.type}; a tool call's name is a text field`]),
    ...(['text', 'enum'].includes(status.type) ? [] : [`status: "${source.status}" is ${status.type}; a tool call's status is a text or enum field`]),
    ...(error === undefined || error.type === 'text' ? [] : [`error: "${source.error}" is ${error.type}; a tool call's error is a text field`]),
  ]
}

/** Where on a page a thread sits: the records around it, its page parameters and their inputs, and where a warning goes. */
export type ToolCallsPage = PathCheckInput & { scope: Scope; inputs: ReadonlyMap<string, SelectInputProps>; warn: (warning: string) => void }

const sampledProblems = (filter: string, model: ResourceModel) => {
  const errors = sampledFilterErrors(model, filter)
  return errors.length === 0 ? [] : [`filter: ${errors.join('; ')}`]
}

// A filter is checked as a block's own filter is: its `{{path}}` slots through the records around the thread, then with
// each value of the page parameters it reads, or else with a stand-in for each slot, such as `task_id = {{@root.id}}`
const filterProblems = (filter: string | undefined, model: ResourceModel, page: ToolCallsPage | undefined): string[] => {
  if (filter === undefined) return []
  if (!page) return sampledProblems(filter, model)
  const placed = pathFindings({ type: 'Thread', props: { filter }, children: [] }, page.scope, page)
  placed.warnings.forEach(page.warn)
  return [...placed.problems, ...(choiceFilterProblems(model, filter, page.inputs) ?? sampledProblems(filter, model))]
}

/**
 * What a thread's tool calls name that their resource does not have, cannot order them by, or cannot show as their
 * name, status or error; on a `page`, also what their filter reads that the records around the thread do not have.
 */
export const toolCallsProblems = (source: ToolCallSource, models: Record<string, ResourceModel>, page?: ToolCallsPage): string[] => {
  const model = Object.hasOwn(models, source.resource) ? models[source.resource] : undefined
  if (!model) return [`unknown resource "${source.resource}"`]
  const unknown = namedFields(source).flatMap(([prop, name]) => (fieldOf(model, name) ? [] : [`${prop}: unknown field "${name}" on ${model.name}`]))
  if (unknown.length > 0) return unknown
  return [...timeProblems(source.time, model, 'tool calls'), ...typeProblems(source, model), ...filterProblems(source.filter, model, page)]
}

/**
 * A thread's tool calls as a caller may see them: gone when they cannot read the calls or the name, time and status of
 * each, and without the input, result or error they cannot read.
 */
export const pruneToolCalls = <S extends ToolCallSource>(source: S, models: Record<string, ResourceModel>): S | undefined => {
  const { input, result, error, ...core } = source
  if (toolCallsProblems(core, models).length > 0) return
  const model = models[source.resource]!
  const keeps = (name: string | undefined) => name !== undefined && fieldOf(model, name) !== undefined
  return { ...core, ...(keeps(input) && { input }), ...(keeps(result) && { result }), ...(keeps(error) && { error }) } as S
}
