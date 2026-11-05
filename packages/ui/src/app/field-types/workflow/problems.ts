import { requiredStepInputs, workflowStepTypes, workflowTriggerTypes, type StepInput } from '@protobase/schema/internal'
import { checkDefinition, type Definition, type Machine, type Problem, type TriggerCheck } from '@protobase/workflows'
import { triggerId } from './definition'

/** A problem as its node shows it: the field it is about, if any, and what is wrong. */
export type NodeProblem = { field?: string; message: string }

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

// A trigger type's input without a field it needs; the server checks the rest of its input on save.
const requiredFields =
  (inputs: readonly StepInput[]): TriggerCheck =>
  (input) =>
    inputs.filter((field) => field.required && (input[field.name] === undefined || input[field.name] === '')).map((field) => ({ field: field.name, message: 'is missing' }))

const triggers = Object.fromEntries(Object.entries(workflowTriggerTypes).map(([type, inputs]) => [type, requiredFields(inputs)]))

// The built-in plugin, whose every type the editor knows; it does not know an app's own plugins' types.
const builtIn = 'app:'
const pluginType = /^[a-z][a-z0-9_]*:/
const ofPlugin = (type: string) => pluginType.test(type) && !type.startsWith(builtIn)

// Every Task's step type, the ones inside Maps too.
const taskTypes = (machine: Machine): string[] =>
  Object.values(machine.States).flatMap((state) => {
    if (state.Type === 'Task') return typeof state.Resource === 'string' ? [state.Resource] : []
    return state.Type === 'Map' && state.ItemProcessor?.States ? taskTypes(state.ItemProcessor) : []
  })

/**
 * The check every save of a workflow runs on the server, with the trigger and step types the editor knows. A type of
 * one of the app's own plugins, which the editor does not list, passes: the server checks it, and its input, on save.
 */
export const definitionProblems = (definition: Definition) => {
  const trigger = Object.keys(definition.trigger ?? {})[0]
  const pluginTrigger = trigger !== undefined && ofPlugin(trigger) && !(trigger in triggers) ? { [trigger]: () => [] } : {}
  const pluginSteps = taskTypes(definition.stateMachine).filter((type) => ofPlugin(type) && !(type in workflowStepTypes))
  return checkDefinition(definition, { resources: [...Object.keys(workflowStepTypes), ...pluginSteps], required: requiredStepInputs, triggers: { ...triggers, ...pluginTrigger } })
}
