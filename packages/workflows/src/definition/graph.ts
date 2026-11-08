import type { Machine, State } from './types'

/** The states a state may go to next, each with the field that names it. */
export const edges = (state: State): { field: string; target: string }[] => {
  const found: { field: string; target: string }[] = []
  if ('Next' in state && state.Next !== undefined) found.push({ field: 'Next', target: state.Next })
  if (state.Type === 'Choice') {
    state.Choices.forEach((rule, index) => found.push({ field: `Choices[${index}].Next`, target: rule.Next }))
    if (state.Default !== undefined) found.push({ field: 'Default', target: state.Default })
  }
  if ('Catch' in state) state.Catch?.forEach((catcher, index) => found.push({ field: `Catch[${index}].Next`, target: catcher.Next }))
  return found
}

/** The names of the states reached from `StartAt` along the edges. */
export const reachable = (machine: Machine) => {
  const seen = new Set<string>()
  const queue = [machine.StartAt]
  while (queue.length > 0) {
    const name = queue.pop()!
    const state = machine.States[name]
    if (seen.has(name) || !state) continue
    seen.add(name)
    for (const edge of edges(state)) queue.push(edge.target)
  }
  return seen
}

/** The states reached from `start` along the edges, `start` itself included. */
export const reachedFrom = (machine: Machine, start: string) => {
  const seen = new Set<string>()
  const stack = [start]
  while (stack.length > 0) {
    const name = stack.pop()!
    const state = machine.States[name]
    if (seen.has(name) || !state) continue
    seen.add(name)
    stack.push(...edges(state).map((edge) => edge.target))
  }
  return seen
}
