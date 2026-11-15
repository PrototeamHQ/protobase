import { depthProblems } from '../depth-problems'
import type { Problem } from '../problem'
import type { ConnectionHeaders } from './http-connection'
import { httpTaskResource, importHttpTask } from './http-task'

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)

// The fields whose state machine runs inside a state: a Map's item processor, a Block's processor.
const innerFields = ['ItemProcessor', 'Iterator', 'Processor']

const importStates = (states: unknown, path: string[], connections: ConnectionHeaders): { states: unknown; problems: Problem[] } => {
  if (!isObject(states)) return { states, problems: [] }
  const problems: Problem[] = []
  const imported = Object.fromEntries(
    Object.entries(states).map(([name, state]) => {
      if (!isObject(state)) return [name, state]
      let next = state
      // A JSONPath state is left as it is, for the check to refuse by name
      if (state.Type === 'Task' && state.Resource === httpTaskResource && state.Parameters === undefined) {
        const result = importHttpTask(state, [...path, name].join('/'), connections)
        problems.push(...result.problems)
        next = result.state
      }
      for (const field of innerFields) {
        const inner = next[field]
        if (!isObject(inner)) continue
        const result = importStates(inner.States, [...path, name], connections)
        problems.push(...result.problems)
        next = { ...next, [field]: { ...inner, States: result.states } }
      }
      return [name, next]
    }),
  )
  return { states: imported, problems }
}

/**
 * A state machine exported from Step Functions with each of its HTTP tasks, in Maps and Blocks too, as an app:http step
 * (see `importHttpTask`), each connection sending the header `connections` gives for it; every other state as it is.
 * With problems, nothing should be saved: each names the state and field that does not import exactly. A machine nesting
 * past the definition's depth limit is given back as it is with that problem, before the import's walk could overflow the stack.
 */
export const importStateMachine = (machine: Record<string, unknown>, connections: ConnectionHeaders = {}): { stateMachine: Record<string, unknown>; problems: Problem[] } => {
  const deep = depthProblems(machine)
  if (deep.length > 0) return { stateMachine: machine, problems: deep }
  const { states, problems } = importStates(machine.States, [], connections)
  return { stateMachine: machine.States === undefined ? machine : { ...machine, States: states }, problems }
}
