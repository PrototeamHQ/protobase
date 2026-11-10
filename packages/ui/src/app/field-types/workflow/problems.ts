import type { WorkflowTypeList } from '@protobase/client'
import { checkDefinition, definitionWarnings, type Definition, type Problem, type TriggerCheck } from '@protobase/workflows'
import { triggerId } from './definition'
import { schemaInputs, type TypeInput } from './type-inputs'

/** A problem as its node shows it: the field it is about, if any, and what is wrong. */
export type NodeProblem = { field?: string; message: string }

/** A field that is still to fill in, rather than one that is wrong. */
export const isMissing = (problem: NodeProblem) => problem.message.startsWith('is missing')

/** The problems without fields still to fill in, as a step shows them until someone tries to save it. */
export const withoutMissing = (byNode: ReadonlyMap<string, NodeProblem[]>) => new Map([...byNode].map(([id, problems]) => [id, problems.filter((problem) => !isMissing(problem))]))

/**
 * The problems the server's save would refuse the definition for, by the node each is about: a state's own, and the
 * trigger's and the first state's on the trigger; any other is about the whole definition, in `whole`.
 */
export const problemsByNode = (problems: readonly Problem[]) => {
  const byNode = new Map<string, NodeProblem[]>()
  const whole: NodeProblem[] = []
  const add = (id: string, problem: NodeProblem) => byNode.set(id, [...(byNode.get(id) ?? []), problem])
  for (const { state, field, message } of problems) {
    const shown = { ...(field !== undefined && { field }), message }
    if (state !== undefined) add(state, shown)
    else if (field?.startsWith('trigger') || field === 'StartAt' || field === 'stateMachine.StartAt') add(triggerId, shown)
    else whole.push(shown)
  }
  return { byNode, whole }
}

const isNames = (value: unknown) => Array.isArray(value) && value.every((name) => typeof name === 'string')

// A trigger type's input without a field it needs, or with names that are no list; the server checks the rest of its
// input on save.
const inputProblems =
  (inputs: readonly TypeInput[]): TriggerCheck =>
  (input) =>
    inputs.flatMap((field) => {
      const value = input[field.name]
      if (value === undefined || value === '') return field.required ? [{ field: field.name, message: 'is missing' }] : []
      return field.kind === 'names' && !isNames(value) ? [{ field: field.name, message: 'is a list of names, separated by commas' }] : []
    })

/**
 * The check every save of a workflow runs on the server, against the app's trigger and step types as the server lists
 * them, its plugins' included: an unknown type, a type the app cannot run, and a missing input it requires.
 */
export const definitionProblems = (definition: Definition, types: WorkflowTypeList) => {
  const steps = types.step_types.filter((type) => type.available)
  const triggers = types.triggers.filter((type) => type.available && type.id !== 'manual')
  const unavailable = [...types.step_types, ...types.triggers].filter((type) => !type.available)
  return checkDefinition(definition, {
    resources: steps.map((type) => type.id),
    required: Object.fromEntries(steps.map((type) => [type.id, schemaInputs(type.input).filter((input) => input.required).map((input) => input.name)])),
    triggers: Object.fromEntries(triggers.map((type) => [type.id, inputProblems(schemaInputs(type.input))])),
    unavailable: Object.fromEntries(unavailable.map((type) => [type.id, type.reason ?? ''])),
  })
}

/** What the check warns of by the node each is about, which a save goes through with: those of no state are left out. */
export const warningsByNode = (definition: Definition) => {
  const byNode = new Map<string, NodeProblem[]>()
  for (const { state, field, message } of definitionWarnings(definition)) {
    if (state === undefined) continue
    byNode.set(state, [...(byNode.get(state) ?? []), { ...(field !== undefined && { field }), message }])
  }
  return byNode
}
