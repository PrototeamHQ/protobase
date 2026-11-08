import { expressionSource } from '../definition/expressions'
import type { Machine } from '../definition/types'
import type { Checkpoint } from './port'

/** What a re-run reads of a failed run's checkpoint to know where its scope goes on. */
export type EarlierCheckpoint = Pick<Checkpoint, 'scope' | 'next'>

// The machine a scope runs: the run's own, or the item processor of each Map its scope names, as `innerScope` writes it.
const machineOf = (machine: Machine, scope: string): Machine | string => {
  if (scope === '') return machine
  let inner = machine
  for (const part of scope.split('/')) {
    const match = /^(.*)\.\d+\[\d+\]$/.exec(part)
    if (!match) throw new Error(`"${scope}" is not the scope of a Map item`)
    const name = decodeURIComponent(match[1]!)
    const state = inner.States[name]
    if (state?.Type !== 'Map') return `The run goes on in the Map "${name}"${scope.includes('/') ? ` of ${scope}` : ''}, which the workflow no longer has`
    inner = state.ItemProcessor
  }
  return inner
}

/**
 * The problem with re-running a failed run whose scopes stand at `checkpoints` on `machine`, the workflow's version
 * now: a scope that would go on at a state, or in a Map, the version does not have; undefined when there is none.
 * Scopes that ended stay as they ran.
 * A re-run goes on from each scope's last checkpoint, as a run does after a crash: the steps since run again, the
 * recorded ones before it never.
 */
export const rerunProblem = (machine: Machine, checkpoints: readonly EarlierCheckpoint[]) => {
  for (const { scope, next } of checkpoints) {
    // A scope that ended, such as a finished Map item, is history and stays as it ran.
    if (next === null) continue
    const inner = machineOf(machine, scope)
    if (typeof inner === 'string') return inner
    if (!Object.hasOwn(inner.States, next)) return `The run goes on at state "${next}"${scope ? ` in ${scope}` : ''}, which the workflow no longer has`
  }
  return
}

/** A failed run's checkpoint as its re-run, started at `clock`, takes it up: the state it goes on at from its first try, now. */
export const rerunCheckpoint = <C extends Checkpoint>({ resumeAt: _, ...checkpoint }: C, clock: Date) => ({ ...checkpoint, attempt: 1, failures: [], clock })

/** How a state keeps its whole result in a variable. */
export const resultRead = '{% $states.result %}'

/**
 * What a kept step assigned, with each variable its state has on the version a re-run runs that keeps its whole result
 * holding that result, whatever it held then: a step kept as it ran still gives what a later step now reads from it, and
 * nothing runs again for it. Its other variables stay as they ran, and so does all a step that did not succeed assigned.
 * The step's output is its whole result only where its state in `ran`, the version the earlier run ran, had no `Output`:
 * a step whose result was shaped then keeps what it assigned, as nothing knows its whole result any more.
 */
export const keptAssigned = (machine: Machine, ran: Machine, step: { scope: string; state: string; status: string; output?: unknown; assigned?: unknown }) => {
  // A step that failed into a catcher gave an error, not its result, and assigned what the catcher says
  const state = step.scope === '' && step.status === 'succeeded' ? machine.States[step.state] : undefined
  const before = ran.States[step.state]
  const assign = state && 'Assign' in state ? (state.Assign as Record<string, unknown> | undefined) : undefined
  if (!state || !assign || !before || ('Output' in before && before.Output !== undefined)) return undefined
  const assigned = (step.assigned ?? {}) as Record<string, unknown>
  const whole = Object.keys(assign).filter((name) => expressionSource(assign[name])?.trim() === '$states.result' && JSON.stringify(assigned[name]) !== JSON.stringify(step.output))
  return whole.length === 0 ? undefined : { ...assigned, ...Object.fromEntries(whole.map((name) => [name, step.output])) }
}
