import { schemaProblems } from './check-schema'
import { assignedNames, stateExpressions } from './expression-fields'
import { edges, reachable } from './graph'
import { inputVariable, reservedVariables } from './names'
import type { Problem } from './problem'
import { builtInFunctions } from './reads'
import { readProblems } from './check-reads'
import type { Definition, Machine } from './types'

/** What a definition is checked against beside the language: the step types (Task resources) the app has. */
export type CheckOptions = { resources: readonly string[] }

type Scope = { path: string[]; visible: ReadonlySet<string>; item: boolean }

const machineProblems = (machine: Machine, scope: Scope, options: CheckOptions): Problem[] => {
  const problems: Problem[] = []
  const where = (name: string) => [...scope.path, name].join('/')
  const prefix = scope.path.length > 0 ? { state: scope.path.join('/') } : {}
  const names = Object.keys(machine.States)
  if (!machine.States[machine.StartAt]) problems.push({ ...prefix, field: 'StartAt', message: `names "${machine.StartAt}", which is not a state here` })
  const visible = new Set([...scope.visible, ...names.flatMap((name) => assignedNames(machine.States[name]!))])
  const reached = reachable(machine)

  for (const name of names) {
    const state = machine.States[name]!
    if (!reached.has(name) && machine.States[machine.StartAt]) problems.push({ state: where(name), message: `is never reached from "${machine.StartAt}"` })
    for (const edge of edges(state)) {
      if (!machine.States[edge.target]) problems.push({ state: where(name), field: edge.field, message: `names "${edge.target}", which is not a state here` })
    }
    for (const variable of assignedNames(state)) {
      if (reservedVariables.has(variable) || builtInFunctions.has(variable)) problems.push({ state: where(name), field: 'Assign', message: `cannot assign $${variable}, a name the runner or JSONata keeps` })
    }
    if (state.Type === 'Task' && !options.resources.includes(state.Resource)) {
      problems.push({ state: where(name), field: 'Resource', message: `"${state.Resource}" is not a step type; use one of ${options.resources.join(', ')}` })
    }
    const firstOfItem = scope.item && name === machine.StartAt
    for (const { field, source, place } of stateExpressions(state)) {
      for (const message of readProblems(source, { place, visible, firstOfItem })) problems.push({ state: where(name), field, message })
    }
    if (state.Type === 'Map') problems.push(...machineProblems(state.ItemProcessor, { path: [...scope.path, name], visible, item: true }, options))
    if (state.Type === 'Parallel') {
      state.Branches.forEach((branch, index) => problems.push(...machineProblems(branch, { path: [...scope.path, name, String(index)], visible, item: false }, options)))
    }
  }
  return problems
}

/**
 * Why a definition cannot be saved, as it is checked on every save: its shape against `definitionSchema`, then each
 * edge, each Task's step type and what each expression reads, in the named-reads profile. Empty when it can be saved.
 */
export const checkDefinition = (definition: unknown, options: CheckOptions): Problem[] => {
  const shape = schemaProblems(definition)
  if (shape.length > 0) return shape
  return machineProblems(definition as Definition, { path: [], visible: new Set([inputVariable]), item: false }, options)
}
