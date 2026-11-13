import { checkFilter, parseFilter, type ResourceModel, type ToolCallFields } from '@protobase/schema'
import { timeProblems } from './check-time'

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

const filterProblems = (filter: string | undefined, model: ResourceModel): string[] => {
  if (filter === undefined) return []
  const parsed = parseFilter(filter)
  const checked = parsed.ok ? (parsed.ast === undefined ? { ok: true as const } : checkFilter(model, parsed.ast)) : parsed
  return checked.ok ? [] : [`filter: ${checked.errors.map((error) => error.message).join('; ')}`]
}

/** What a thread's tool calls name that their resource does not have, cannot order them by, or cannot show as their name, status or error. */
export const toolCallsProblems = (source: ToolCallSource, models: Record<string, ResourceModel>): string[] => {
  const model = Object.hasOwn(models, source.resource) ? models[source.resource] : undefined
  if (!model) return [`unknown resource "${source.resource}"`]
  const unknown = namedFields(source).flatMap(([prop, name]) => (fieldOf(model, name) ? [] : [`${prop}: unknown field "${name}" on ${model.name}`]))
  if (unknown.length > 0) return unknown
  return [...timeProblems(source.time, model, 'tool calls'), ...typeProblems(source, model), ...filterProblems(source.filter, model)]
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
