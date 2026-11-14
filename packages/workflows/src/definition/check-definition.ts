import { schemaProblems } from './check-schema'
import { triggerProblems, type TriggerCheck } from './check-trigger'
import { assignedNames, stateExpressions } from './expression-fields'
import { expressionSource } from './expressions'
import { edges, reachable } from './graph'
import { reservedVariables } from './names'
import type { Problem } from './problem'
import { builtInFunctions } from './reads'
import { readProblems } from './check-reads'
import { connectionProblems } from './used-connections'
import type { Definition, Machine, TaskState } from './types'
import { visibleVariables } from './visible'
import { blockProblems } from './check-block'
import { allStates } from './inner'
import { limits } from '../limits'
import { nestingDepth } from '../nesting'
import { pinProblems } from './pins/check-pins'
import type { PinSchemas } from './pins/pin-sources'
import { dataflowProblems, dataflowVisible } from './dataflow/check-dataflow'
import { orderOf } from './types'

/**
 * What a definition is checked against beside the language: the step types (Task resources) the app has, the
 * arguments each needs (`required`, by step type), its trigger types, each with the check of its input, and why the
 * app cannot run a type it knows (`unavailable`, by step or trigger type), and the connection `<plugin>:<connection>`
 * each type that signs in uses (`connections`, by step or trigger type); without it the bindings are not checked.
 * With `pins`, the types' input and output schemas and the app's records, an argument that reads a value by name is
 * checked to take that value's type.
 */
export type CheckOptions = {
  resources: readonly string[]
  required?: Readonly<Record<string, readonly string[]>>
  triggers: Readonly<Record<string, TriggerCheck>>
  unavailable?: Readonly<Record<string, string>>
  connections?: Readonly<Record<string, string>>
  pins?: PinSchemas
}

// `blocks`: how many Blocks the machine is inside; `data`: whether its states run in dataflow order, and `steps` the
// names of the states around it whose status its states may read.
type Scope = { path: string[]; outer: ReadonlySet<string>; item: boolean; blocks: number; data: boolean; steps: ReadonlySet<string> }

// The arguments a Task's step type needs and its Arguments leave out; none when Arguments is one expression, whose
// value is known only when it runs.
const missingArguments = (state: TaskState, options: CheckOptions) => {
  const needed = options.required?.[state.Resource] ?? []
  if (expressionSource(state.Arguments) !== undefined) return []
  const given = typeof state.Arguments === 'object' && state.Arguments !== null ? (state.Arguments as Record<string, unknown>) : {}
  return needed.filter((name) => given[name] === undefined || given[name] === '')
}

const machineProblems = (machine: Machine, scope: Scope, options: CheckOptions): Problem[] => {
  const problems: Problem[] = []
  const where = (name: string) => [...scope.path, name].join('/')
  const prefix = scope.path.length > 0 ? { state: scope.path.join('/') } : {}
  const names = Object.keys(machine.States)
  const { data } = scope
  // In dataflow order a machine has no start: each state starts once the states it reads from have ended
  if (!data && !machine.States[machine.StartAt]) problems.push({ ...prefix, field: 'StartAt', message: `names "${machine.StartAt}", which is not a state here` })
  const visible = data ? dataflowVisible(machine, scope.outer) : visibleVariables(machine, scope.outer)
  const reached = data ? undefined : reachable(machine)
  const steps = new Set([...scope.steps, ...names])

  for (const name of names) {
    const state = machine.States[name]!
    if (reached && !reached.has(name) && machine.States[machine.StartAt]) problems.push({ state: where(name), message: `is never reached from "${machine.StartAt}"` })
    for (const edge of edges(state)) {
      if (!machine.States[edge.target]) problems.push({ state: where(name), field: edge.field, message: `names "${edge.target}", which is not a state here` })
    }
    for (const variable of assignedNames(state)) {
      if (reservedVariables.has(variable) || builtInFunctions.has(variable)) problems.push({ state: where(name), field: 'Assign', message: `cannot assign $${variable}, a name the runner or JSONata keeps` })
      if (scope.outer.has(variable)) problems.push({ state: where(name), field: 'Assign', message: `cannot assign $${variable}, which an outer state assigns already` })
    }
    if (state.Type === 'Task' && options.unavailable && Object.hasOwn(options.unavailable, state.Resource)) {
      problems.push({ state: where(name), field: 'Resource', message: `"${state.Resource}" cannot run in this app: ${options.unavailable[state.Resource]}` })
    } else if (state.Type === 'Task' && !options.resources.includes(state.Resource)) {
      problems.push({ state: where(name), field: 'Resource', message: `"${state.Resource}" is not a step type; use one of ${options.resources.join(', ')}` })
    }
    if (state.Type === 'Task') for (const missing of missingArguments(state, options)) problems.push({ state: where(name), field: `Arguments.${missing}`, message: `is missing; ${state.Resource} needs it` })
    // In dataflow order every state of an item's machine starts from the item, which it reads as $states.input
    const firstOfItem = scope.item && (data || name === machine.StartAt)
    for (const { field, source, place } of stateExpressions(state)) {
      for (const message of readProblems(source, { place, visible: visible.get(name)!, firstOfItem, inBlock: scope.blocks > 0, ...(data && { steps }) })) problems.push({ state: where(name), field, message })
    }
    if (state.Type === 'Map') problems.push(...machineProblems(state.ItemProcessor, { ...scope, path: [...scope.path, name], outer: visible.get(name)!, item: true, steps }, options))
    // A Block's steps run as a run of their own: they read its input, never the variables around it.
    if (state.Type === 'Block') {
      problems.push(...blockProblems(state, where(name), scope.blocks + 1))
      problems.push(...machineProblems(state.Processor, { path: [...scope.path, name], outer: new Set(), item: false, blocks: scope.blocks + 1, data, steps: new Set() }, options))
    }
  }
  if (data) problems.push(...dataflowProblems(machine, where))
  return problems
}

const wholeProblems = (definition: Definition): Problem[] => {
  const names = allStates(definition.stateMachine).map(([name]) => name)
  const problems: Problem[] = []
  if (names.length > limits.states) problems.push({ field: 'stateMachine.States', message: `holds ${names.length} states, more than the ${limits.states} a workflow may have` })
  const seen = new Set<string>()
  for (const name of names) {
    if (seen.has(name)) problems.push({ state: name, message: 'is a state name used twice; names are unique across the whole state machine, Maps and Blocks included' })
    seen.add(name)
  }
  return problems
}

/**
 * Why a definition cannot be saved, as it is checked on every save: its size and nesting, its shape against `definitionSchema`, its
 * trigger and the connections it binds, then each edge, each Task's step type and what each expression reads, in the named-reads profile. Empty when
 * it can be saved.
 */
export const checkDefinition = (definition: unknown, options: CheckOptions): Problem[] => {
  const bytes = new TextEncoder().encode(JSON.stringify(definition) ?? '').length
  if (bytes > limits.definitionBytes) return [{ message: `The definition is ${bytes} bytes as JSON, more than the ${limits.definitionBytes} a workflow may have` }]
  if (nestingDepth(definition, limits.definitionDepth) > limits.definitionDepth) return [{ message: `The definition nests more than ${limits.definitionDepth} levels of arrays and objects` }]
  const shape = schemaProblems(definition)
  if (shape.length > 0) return shape
  const document = definition as Definition
  return [...triggerProblems(document.trigger, options.triggers, options.unavailable), ...(options.connections ? connectionProblems(document, options.connections) : []), ...wholeProblems(document), ...machineProblems(document.stateMachine, { path: [], outer: new Set(), item: false, blocks: 0, data: orderOf(document) === 'data', steps: new Set() }, options), ...(options.pins ? pinProblems(document, options.pins) : [])]
}
