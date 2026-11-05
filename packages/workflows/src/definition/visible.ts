import { reachedFrom } from './graph'
import type { Machine, State } from './types'

// The variables each edge of a state carries on, as the runner assigns them: a Choice rule's Assign (else the state's)
// along its Next, the state's own along Next and Default, and a catcher's along its Next.
const passedOn = (state: State) => {
  const own = Object.keys(('Assign' in state && state.Assign) || {})
  const along: { target: string; names: string[] }[] = []
  if ('Next' in state && state.Next !== undefined) along.push({ target: state.Next, names: own })
  if (state.Type === 'Choice') {
    for (const rule of state.Choices) along.push({ target: rule.Next, names: Object.keys(rule.Assign ?? state.Assign ?? {}) })
    if (state.Default !== undefined) along.push({ target: state.Default, names: own })
  }
  if ('Catch' in state) for (const catcher of state.Catch ?? []) along.push({ target: catcher.Next, names: Object.keys(catcher.Assign ?? {}) })
  return along
}

/**
 * The variables each state of a machine may read: those of the outer scopes, and each one assigned on an edge some path
 * from `StartAt` takes before it. A state's own Assign takes effect from the next state on, and only along the edges
 * that assign it: a Choice rule's along its Next, a catcher's along its own.
 */
export const visibleVariables = (machine: Machine, outer: ReadonlySet<string>) => {
  const visible = new Map(Object.keys(machine.States).map((name) => [name, new Set(outer)]))
  for (const state of Object.values(machine.States)) {
    for (const { target, names } of passedOn(state)) {
      if (names.length === 0) continue
      for (const later of reachedFrom(machine, target)) for (const variable of names) visible.get(later)?.add(variable)
    }
  }
  return visible
}
