import type { Definition, Machine } from '@protobase/workflows'

const statesOf = (machine: Machine): [string, unknown][] => Object.entries(machine.States).flatMap(([name, state]) => [[name, state] as [string, unknown], ...(state.Type === 'Map' ? statesOf(state.ItemProcessor) : [])])

/** How many steps differ between two definitions, by name: changed, added and removed. */
export const versionDiff = (from: Definition, to: Definition) => {
  const before = new Map(statesOf(from.stateMachine).map(([name, state]) => [name, JSON.stringify(state)]))
  const after = statesOf(to.stateMachine)
  const added = after.filter(([name]) => !before.has(name)).length
  const changed = after.filter(([name, state]) => before.has(name) && before.get(name) !== JSON.stringify(state)).length
  return { changed, added, removed: before.size - (after.length - added) }
}
