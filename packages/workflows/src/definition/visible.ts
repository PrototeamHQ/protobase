import { assignedNames } from './expression-fields'
import { edges } from './graph'
import type { Machine } from './types'

// The states reached from `from` along its edges, `from` itself only when a cycle leads back to it.
const after = (machine: Machine, from: string) => {
  const seen = new Set<string>()
  const stack = edges(machine.States[from]!).map((edge) => edge.target)
  while (stack.length > 0) {
    const name = stack.pop()!
    const state = machine.States[name]
    if (seen.has(name) || !state) continue
    seen.add(name)
    stack.push(...edges(state).map((edge) => edge.target))
  }
  return seen
}

/**
 * The variables each state of a machine may read: those of the outer scopes, and each one a state that can run before it
 * assigns. A state's own Assign takes effect from the next state on.
 */
export const visibleVariables = (machine: Machine, outer: ReadonlySet<string>) => {
  const visible = new Map(Object.keys(machine.States).map((name) => [name, new Set(outer)]))
  for (const [name, state] of Object.entries(machine.States)) {
    for (const later of after(machine, name)) for (const variable of assignedNames(state)) visible.get(later)?.add(variable)
  }
  return visible
}
