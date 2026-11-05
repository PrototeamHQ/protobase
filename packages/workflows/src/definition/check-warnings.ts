import { stateExpressions } from './expression-fields'
import { parse } from './expressions'
import { reachedFrom } from './graph'
import type { Problem } from './problem'
import { expressionReads } from './reads'
import type { Definition, Machine, State, TaskState } from './types'

/** The step types whose calls are not done again by default, as their step types say. */
export type WarningOptions = { doNotRepeat?: readonly string[] }

// The variables each expression of a state reads, the states of a Map's item processor included, with their fields.
const readsOf = (state: State, path: string): { state: string; field: string; variables: Set<string> }[] => {
  const own = stateExpressions(state).flatMap(({ field, source }) => {
    const parsed = parse(source)
    return 'error' in parsed ? [] : [{ state: path, field, variables: expressionReads(parsed.expression).variables }]
  })
  if (state.Type !== 'Map') return own
  return [...own, ...Object.entries(state.ItemProcessor.States).flatMap(([name, inner]) => readsOf(inner, `${path}/${name}`))]
}

const machineWarnings = (machine: Machine, path: string[], options: WarningOptions): Problem[] => {
  const where = (name: string) => [...path, name].join('/')
  const warnings = new Map<string, Problem>()
  for (const [name, state] of Object.entries(machine.States)) {
    if (state.Type === 'Map') for (const warning of machineWarnings(state.ItemProcessor, [...path, name], options)) warnings.set(JSON.stringify(warning), warning)
    if (state.Type !== 'Task' || !(state.DoNotRepeat ?? options.doNotRepeat?.includes(state.Resource) ?? false)) continue
    const fetched = new Set(Object.keys((state as TaskState).Assign ?? {}))
    if (fetched.size === 0 || state.Next === undefined) continue
    for (const waitName of reachedFrom(machine, state.Next)) {
      const wait = machine.States[waitName]!
      if (wait.Type !== 'Wait' || wait.Next === undefined) continue
      for (const laterName of reachedFrom(machine, wait.Next)) {
        for (const read of readsOf(machine.States[laterName]!, where(laterName))) {
          for (const variable of read.variables) {
            if (!fetched.has(variable)) continue
            const warning = { state: read.state, field: read.field, message: `reads $${variable}, which "${where(name)}" fetched once before the Wait "${where(waitName)}": it may have expired by then` }
            warnings.set(JSON.stringify(warning), warning)
          }
        }
      }
    }
  }
  return [...warnings.values()]
}

/**
 * What a definition that can be saved may still get wrong, which a save does not refuse: a state that reads, after a
 * Wait, a value a step fetched once (`DoNotRepeat`, by the Task or its step type) before it, such as a signed URL,
 * which may have expired by then. Read the value after the Wait, or fetch it again there.
 */
export const definitionWarnings = (definition: Definition, options: WarningOptions = {}): Problem[] => machineWarnings(definition.stateMachine, [], options)
