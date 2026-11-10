import { innerMachine, type Definition, type Machine, type State } from '@protobase/workflows'

/** A state's path: its name, after the names of the Maps and Blocks it is inside, joined by `/` as the definition check names it. */
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

/** The path of a state named `name` in the machine at `scope`, the path of a Map or Block or [] for the whole workflow. */
export const pathOf = (scope: readonly string[], name: string): StatePath => [...scope, name].join('/')

/** The Maps and Blocks a path is inside, outermost first, and its own name. */
export const splitPath = (path: StatePath) => {
  const names = pathNames(path)
  return { scope: names.slice(0, -1), name: names.at(-1)! }
}

/** The machine at `scope`: the whole workflow's for [], else the steps of the Map or Block at that path. */
export const machineAt = (definition: Definition, scope: readonly string[]): Machine | undefined => {
  let machine: Machine | undefined = definition.stateMachine
  for (const name of scope) machine = innerMachine(machine?.States[name])
  return machine
}

/** The state at a path, when there is one. */
export const stateAt = (definition: Definition, path: StatePath): State | undefined => {
  const { scope, name } = splitPath(path)
  return machineAt(definition, scope)?.States[name]
}

/** Every state name, the ones inside Maps and Blocks too, which are unique across the whole definition. */
export const allNames = (machine: Machine): string[] =>
  Object.entries(machine.States).flatMap(([name, state]) => {
    const inner = innerMachine(state)
    return [name, ...(inner?.States ? allNames(inner) : [])]
  })

/** The path of the state named `name`, wherever it is in the definition: names are unique across it. */
export const pathOfName = (machine: Machine, name: string, scope: readonly string[] = []): string[] | undefined => {
  if (Object.hasOwn(machine.States, name)) return [...scope, name]
  for (const [other, state] of Object.entries(machine.States)) {
    const inner = innerMachine(state)
    const found = inner?.States && pathOfName(inner, name, [...scope, other])
    if (found) return found
  }
  return
}

/** Whether a state holds steps of its own, drawn inside it: a Map's or a Block's. */
export const holdsSteps = (state: State | undefined) => state?.Type === 'Map' || state?.Type === 'Block'
