import type { Definition, Machine, State } from '@protobase/workflows'

/** A state's path: its name, after the names of the Maps it is inside, joined by `/` as the definition check names it. */
export type StatePath = string

/** The node of the workflow's trigger, which leads to the first state; no state path is empty. */
export const triggerId = ''

/** What a workflow without a definition starts from: run by hand, and no state yet. */
export const emptyDefinition = (): Definition => ({ trigger: { manual: {} }, stateMachine: { QueryLanguage: 'JSONata', StartAt: '', States: {} } })

/** The value as a definition to draw and edit: a workflow without one starts empty. */
export const definitionOf = (value: unknown): Definition => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return emptyDefinition()
  const given = value as Partial<Definition>
  const machine = given.stateMachine
  const States = typeof machine?.States === 'object' && machine.States !== null && !Array.isArray(machine.States) ? machine.States : {}
  return { ...given, trigger: given.trigger ?? { manual: {} }, stateMachine: { ...machine, QueryLanguage: 'JSONata', StartAt: machine?.StartAt ?? '', States } } as Definition
}

/** The names of a path, outermost first. */
export const pathNames = (path: StatePath) => path.split('/')

/** The path of a state named `name` in the machine at `scope`, the path of a Map or [] for the whole workflow. */
export const pathOf = (scope: readonly string[], name: string): StatePath => [...scope, name].join('/')

/** The Maps a path is inside, outermost first, and its own name. */
export const splitPath = (path: StatePath) => {
  const names = pathNames(path)
  return { scope: names.slice(0, -1), name: names.at(-1)! }
}

/** The machine at `scope`: the whole workflow's for [], else the item processor of the Map at that path. */
export const machineAt = (definition: Definition, scope: readonly string[]): Machine | undefined => {
  let machine: Machine = definition.stateMachine
  for (const name of scope) {
    const state = machine.States[name]
    if (state?.Type !== 'Map') return
    machine = state.ItemProcessor
  }
  return machine
}

/** The state at a path, when there is one. */
export const stateAt = (definition: Definition, path: StatePath): State | undefined => {
  const { scope, name } = splitPath(path)
  return machineAt(definition, scope)?.States[name]
}

/** Every state name, the ones inside Maps too, which are unique across the whole definition. */
export const allNames = (machine: Machine): string[] =>
  Object.entries(machine.States).flatMap(([name, state]) => [name, ...(state.Type === 'Map' && state.ItemProcessor?.States ? allNames(state.ItemProcessor) : [])])
