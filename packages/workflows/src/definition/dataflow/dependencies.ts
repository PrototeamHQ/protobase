import { expressionReads } from '../reads'
import { parse } from '../expressions'
import { assignedNames, stateExpressions } from '../expression-fields'
import { innerMachine } from '../inner'
import type { Machine, State } from '../types'

/**
 * What a state of a dataflow machine runs after: the states whose variables it reads (`data`), and those whose
 * `$states.context.Steps.<name>` it reads (`status`), of which `handled` are those its `Condition` reads, which take
 * the default skip away for them.
 */
export type Dependencies = { data: Set<string>; status: Set<string>; handled: Set<string> }

type Read = { variables: string[]; steps: string[]; condition: boolean }

// The variables and the Steps entries each expression of a state reads, a Map's item processor's reads of the scopes
// around it included, as its items run only once those have ended. A Block's steps read only its own input.
const readsOf = (state: State): Read[] => {
  const found: Read[] = []
  for (const { field, source } of stateExpressions(state)) {
    const parsed = parse(source)
    if ('error' in parsed) continue
    const reads = expressionReads(parsed.expression)
    const steps = reads.states.filter((path) => path[0] === 'context' && path[1] === 'Steps' && path[2] !== undefined).map((path) => path[2]!)
    found.push({ variables: [...reads.variables], steps, condition: field === 'Condition' })
  }
  const inner = state.Type === 'Map' ? innerMachine(state) : undefined
  if (inner) {
    const own = new Set(Object.values(inner.States).flatMap(assignedNames))
    const innerNames = new Set(Object.keys(inner.States))
    for (const read of Object.values(inner.States).flatMap(readsOf)) {
      found.push({ variables: read.variables.filter((name) => !own.has(name)), steps: read.steps.filter((name) => !innerNames.has(name)), condition: false })
    }
  }
  return found
}

/** The state of `machine` that assigns each variable, by the variable; a variable two states assign maps to the first. */
export const assigners = (machine: Machine) => {
  const by = new Map<string, string>()
  for (const [name, state] of Object.entries(machine.States)) for (const variable of assignedNames(state)) if (!by.has(variable)) by.set(variable, name)
  return by
}

/** Each state's dependencies on the other states of its dataflow machine, by name. Reads of the scopes around it are not among them. */
export const machineDependencies = (machine: Machine): Map<string, Dependencies> => {
  const by = assigners(machine)
  return new Map(
    Object.entries(machine.States).map(([name, state]) => {
      const dependencies: Dependencies = { data: new Set(), status: new Set(), handled: new Set() }
      for (const read of readsOf(state)) {
        for (const variable of read.variables) {
          const from = by.get(variable)
          if (from !== undefined) dependencies.data.add(from)
        }
        for (const step of read.steps) {
          if (!Object.hasOwn(machine.States, step)) continue
          dependencies.status.add(step)
          if (read.condition) dependencies.handled.add(step)
        }
      }
      return [name, dependencies]
    }),
  )
}

/** Every state a state depends on, data and status alike. */
export const dependsOn = (dependencies: Dependencies) => new Set([...dependencies.data, ...dependencies.status])

/** A cycle among the dependencies, as the state names around it with the first again at the end; none when there is none. */
export const dependencyCycle = (dependencies: ReadonlyMap<string, Dependencies>): string[] | undefined => {
  const state = new Map<string, 'open' | 'done'>()
  const path: string[] = []
  const visit = (name: string): string[] | undefined => {
    if (state.get(name) === 'done') return
    if (state.get(name) === 'open') return [...path.slice(path.indexOf(name)), name]
    state.set(name, 'open')
    path.push(name)
    for (const next of dependsOn(dependencies.get(name) ?? { data: new Set(), status: new Set(), handled: new Set() })) {
      const found = visit(next)
      if (found) return found
    }
    path.pop()
    state.set(name, 'done')
    return
  }
  for (const name of dependencies.keys()) {
    const found = visit(name)
    if (found) return found
  }
  return
}
