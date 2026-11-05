import { schemaProblems } from './check-schema'
import { triggerProblems, type TriggerCheck } from './check-trigger'
import { assignedNames, stateExpressions } from './expression-fields'
import { expressionSource } from './expressions'
import { edges, reachable } from './graph'
import { reservedVariables } from './names'
import type { Problem } from './problem'
import { builtInFunctions } from './reads'
import { readProblems } from './check-reads'
import type { Definition, Machine, TaskState } from './types'
import { visibleVariables } from './visible'
import { limits } from '../limits'
import { nestingDepth } from '../nesting'

/**
 * What a definition is checked against beside the language: the step types (Task resources) the app has, the
 * arguments each needs (`required`, by step type), its trigger types, each with the check of its input, and why the
 * app cannot run a type it knows (`unavailable`, by step or trigger type).
 */
export type CheckOptions = { resources: readonly string[]; required?: Readonly<Record<string, readonly string[]>>; triggers: Readonly<Record<string, TriggerCheck>>; unavailable?: Readonly<Record<string, string>> }

type Scope = { path: string[]; outer: ReadonlySet<string>; item: boolean }

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
  if (!machine.States[machine.StartAt]) problems.push({ ...prefix, field: 'StartAt', message: `names "${machine.StartAt}", which is not a state here` })
  const visible = visibleVariables(machine, scope.outer)
  const reached = reachable(machine)

  for (const name of names) {
    const state = machine.States[name]!
    if (!reached.has(name) && machine.States[machine.StartAt]) problems.push({ state: where(name), message: `is never reached from "${machine.StartAt}"` })
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
    const firstOfItem = scope.item && name === machine.StartAt
    for (const { field, source, place } of stateExpressions(state)) {
      for (const message of readProblems(source, { place, visible: visible.get(name)!, firstOfItem })) problems.push({ state: where(name), field, message })
    }
    if (state.Type === 'Map') problems.push(...machineProblems(state.ItemProcessor, { path: [...scope.path, name], outer: visible.get(name)!, item: true }, options))
  }
  return problems
}

// Every state name, the ones inside Maps too.
const stateNames = (machine: Machine): string[] =>
  Object.entries(machine.States).flatMap(([name, state]) => [name, ...(state.Type === 'Map' ? stateNames(state.ItemProcessor) : [])])

const wholeProblems = (definition: Definition): Problem[] => {
  const names = stateNames(definition.stateMachine)
  const problems: Problem[] = []
  if (names.length > limits.states) problems.push({ field: 'stateMachine.States', message: `holds ${names.length} states, more than the ${limits.states} a workflow may have` })
  const seen = new Set<string>()
  for (const name of names) {
    if (seen.has(name)) problems.push({ state: name, message: 'is a state name used twice; names are unique across the whole state machine, Maps included' })
    seen.add(name)
  }
  return problems
}

/**
 * Why a definition cannot be saved, as it is checked on every save: its size and nesting, its shape against `definitionSchema`, its
 * trigger, then each edge, each Task's step type and what each expression reads, in the named-reads profile. Empty when
 * it can be saved.
 */
export const checkDefinition = (definition: unknown, options: CheckOptions): Problem[] => {
  const bytes = new TextEncoder().encode(JSON.stringify(definition) ?? '').length
  if (bytes > limits.definitionBytes) return [{ message: `The definition is ${bytes} bytes as JSON, more than the ${limits.definitionBytes} a workflow may have` }]
  if (nestingDepth(definition, limits.definitionDepth) > limits.definitionDepth) return [{ message: `The definition nests more than ${limits.definitionDepth} levels of arrays and objects` }]
  const shape = schemaProblems(definition)
  if (shape.length > 0) return shape
  const document = definition as Definition
  return [...triggerProblems(document.trigger, options.triggers, options.unavailable), ...wholeProblems(document), ...machineProblems(document.stateMachine, { path: [], outer: new Set(), item: false }, options)]
}
