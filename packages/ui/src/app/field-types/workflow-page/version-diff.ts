import type { Definition, Machine, State } from '@protobase/workflows'

// Each state by its own fields: a Map without the states inside it, which count as steps of their own
const own = (state: State): unknown => (state.Type === 'Map' ? { ...state, ItemProcessor: { ...state.ItemProcessor, States: Object.keys(state.ItemProcessor.States) } } : state)

const statesOf = (machine: Machine): [string, unknown][] => Object.entries(machine.States).flatMap(([name, state]) => [[name, own(state)] as [string, unknown], ...(state.Type === 'Map' ? statesOf(state.ItemProcessor) : [])])

/** How many steps differ between two definitions, by name: changed, added and removed. */
export const versionDiff = (from: Definition, to: Definition) => {
  const before = new Map(statesOf(from.stateMachine).map(([name, state]) => [name, JSON.stringify(state)]))
  const after = statesOf(to.stateMachine)
  const added = after.filter(([name]) => !before.has(name)).length
  const changed = after.filter(([name, state]) => before.has(name) && before.get(name) !== JSON.stringify(state)).length
  return { changed, added, removed: before.size - (after.length - added) }
}
