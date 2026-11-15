import { assignedNames } from '../expression-fields'
import type { Problem } from '../problem'
import type { Machine } from '../types'
import { dependencyCycle, machineDependencies } from './dependencies'

/**
 * The variables each state of a dataflow machine may read: those of the scopes around it, and each one another state of
 * the machine assigns, which makes that state one it runs after. A state does not read its own.
 */
export const dataflowVisible = (machine: Machine, outer: ReadonlySet<string>) => {
  const all = Object.entries(machine.States).map(([name, state]) => [name, assignedNames(state)] as const)
  return new Map(all.map(([name, own]) => [name, new Set([...outer, ...all.flatMap(([other, names]) => (other === name ? [] : names)).filter((variable) => !own.includes(variable))])]))
}

/**
 * What a dataflow machine needs beside its states' own checks: each variable assigned by one state alone, so a read names
 * the one state it runs after, and no state that runs after itself through the states it reads from.
 */
export const dataflowProblems = (machine: Machine, where: (name: string) => string): Problem[] => {
  const problems: Problem[] = []
  const first = new Map<string, string>()
  for (const [name, state] of Object.entries(machine.States)) {
    for (const variable of new Set(assignedNames(state))) {
      const earlier = first.get(variable)
      if (earlier === undefined) first.set(variable, name)
      else problems.push({ state: where(name), field: 'Assign', message: `assigns $${variable}, which ${earlier} assigns already; in dataflow order each variable has one state that assigns it` })
    }
  }
  const cycle = dependencyCycle(machineDependencies(machine))
  if (cycle) problems.push({ state: where(cycle[0]!), message: `runs after itself: ${cycle.join(' reads ')}; a state cannot read what runs after it` })
  return problems
}
