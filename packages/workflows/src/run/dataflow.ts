import { dependsOn, machineDependencies, type Dependencies } from '../definition/dataflow/dependencies'
import type { Machine, State } from '../definition/types'
import { limits } from '../limits'
import type { ScopeOutcome, SegmentContext } from './context'
import { evaluateTemplate } from './evaluate'
import { StepError } from './errors'
import { caughtVariable } from './recovery'
import { runScope } from './scope'
import { stepFunctions } from './step-functions'
import type { ErrorOutput } from './errors'

/** How a state of a dataflow machine ended, as `$states.context.Steps.<name>` gives it. */
export type StepStatus = { Status: 'SUCCEEDED' | 'FAILED' | 'TIMED_OUT' | 'ABORTED' | 'SKIPPED'; Error: string | null; Cause: string | null }

/** A state run on its own: its scope's one state, which ends the scope, as it ends in sequence order with `End`. */
export const alone = (name: string, state: State): Machine => ({ StartAt: name, States: { [name]: state.Type === 'Fail' ? state : { ...state, End: true } as State } })

const failedStatus = (error: string, cause: string): StepStatus => ({ Status: error === 'States.Timeout' ? 'TIMED_OUT' : 'FAILED', Error: error, Cause: cause })

/** The scope a state of a dataflow machine runs under: the machine's, then the state's name. */
export const scopeOf = (where: string, name: string) => `${where ? `${where}/` : ''}${encodeURIComponent(name)}`

type Settled = { name: string; outcome: ScopeOutcome }

/**
 * Runs a machine in dataflow order: each state, under a scope of its own, once every state it reads from has ended, as
 * many at once as are ready, up to `limits.mapConcurrency`. A state is skipped when one it reads from did not succeed and
 * its Condition does not read that one's Status, or when its Condition is false. An uncaught failure fails the scope at
 * once: the states running, those of Maps inside them too, finish the step they are in and take no other. A Map item's
 * states read the statuses of the states around their Map as well as each other's. The scope ends with the output of the states
 * no other reads from, by name, or that one state's alone. A state that waits, or one the segment's time stops, pauses
 * the scope once nothing else can go on; the next segment takes each state up from its own checkpoint.
 */
export const runDataflow = async (context: SegmentContext, machine: Machine, where: { scope: string; logical: string }, input: unknown, outer: Record<string, unknown>, clock: Date): Promise<ScopeOutcome> => {
  const dependencies = machineDependencies(machine)
  const names = Object.keys(machine.States)
  // By name with no prototype, so a state named as an object's own member, such as toString, is no status of its own
  const statuses: Record<string, StepStatus> = Object.create(null)
  const variables: Record<string, unknown> = {}
  const outputs = new Map<string, unknown>()
  // The states see each other's statuses as they end, and those of the states around them, which ended before they
  // started. The context inherits the segment's rather than copying it, so a failure around this machine stops it too;
  // its own failure stops its states, and the machines inside them, before their next step.
  const steps: Record<string, unknown> = Object.assign(Object.create(null), context.stateContext.Steps)
  const local: SegmentContext = Object.create(context, { stateContext: { value: { ...context.stateContext, Steps: steps }, enumerable: true } })
  const stop = () => Object.defineProperty(local, 'deadline', { value: 0, writable: true, enumerable: true })
  const running = new Map<string, Promise<Settled>>()
  const paused: ScopeOutcome[] = []
  const held = new Set<string>()
  let failure: ErrorOutput | undefined

  const ready = (name: string) => [...dependsOn(dependencies.get(name)!)].every((other) => statuses[other] !== undefined)
  const settle = (name: string, status: StepStatus) => {
    statuses[name] = status
    steps[name] = status
  }
  const skip = (name: string, cause: string) => settle(name, { Status: 'SKIPPED', Error: null, Cause: cause })
  // Whether the state runs: a dependency that did not succeed skips it unless its Condition reads that one's Status;
  // else its Condition decides.
  const runs = async (name: string, own: Dependencies): Promise<boolean> => {
    const failed = [...dependsOn(own)].find((other) => statuses[other]!.Status !== 'SUCCEEDED' && !own.handled.has(other))
    if (failed !== undefined) {
      skip(name, `reads ${failed}, which ended ${statuses[failed]!.Status}`)
      return false
    }
    const condition = machine.States[name]!.Condition
    if (condition === undefined) return true
    const bindings = { ...outer, ...variables, ...stepFunctions(clock, `${context.runId}/${scopeOf(where.scope, name)}/condition`), states: { input, context: local.stateContext } }
    if (await evaluateTemplate(condition, bindings, 'Condition')) return true
    skip(name, 'its Condition is false')
    return false
  }
  const start = (name: string) => {
    const scope = { scope: scopeOf(where.scope, name), logical: scopeOf(where.logical, name) }
    // Its own state runs as sequence order runs one; a Map in it runs its items as `runMachine` says
    running.set(name, runScope(local, alone(name, machine.States[name]!), scope, input, { ...outer, ...variables }, clock).then((outcome) => ({ name, outcome })))
  }
  const ended = (name: string, outcome: ScopeOutcome) => {
    if (outcome.kind === 'ended') {
      const { [caughtVariable]: caught, ...assigned } = (outcome.variables ?? {}) as Record<string, unknown>
      Object.assign(variables, assigned)
      outputs.set(name, outcome.output)
      const error = caught as ErrorOutput | undefined
      settle(name, error ? failedStatus(error.Error, error.Cause) : { Status: 'SUCCEEDED', Error: null, Cause: null })
    } else if (outcome.kind === 'failed') {
      settle(name, failedStatus(outcome.error, outcome.cause))
      failure ??= { Error: outcome.error, Cause: outcome.cause }
      stop()
    } else {
      held.add(name)
      paused.push(outcome)
    }
  }

  // Starts every state that is ready, again while a skip makes another ready, which an earlier pass went by.
  const startReady = async () => {
    for (let skipped = true; skipped && !failure; ) {
      skipped = false
      for (const name of names) {
        if (statuses[name] || running.has(name) || held.has(name) || !ready(name) || running.size >= limits.mapConcurrency) continue
        try {
          // A state the run took up from a checkpoint of its own already passed its Condition, which may have changed since
          if (context.saved.has(scopeOf(where.scope, name)) || (await runs(name, dependencies.get(name)!))) start(name)
          else skipped = true
        } catch (error) {
          if (!(error instanceof StepError)) throw error
          ended(name, { kind: 'failed', error: error.error, cause: error.reason })
          return
        }
      }
    }
  }
  try {
    for (;;) {
      await startReady()
      if (running.size === 0) break
      const { name, outcome } = await Promise.race(running.values())
      running.delete(name)
      ended(name, outcome)
    }
  } catch (error) {
    // Such as a save that failed: the states still running stop at their next step and end before it goes on, so
    // nothing of this segment runs on beside the one that takes the run up again.
    stop()
    await Promise.allSettled(running.values())
    throw error
  }
  if (failure) return { kind: 'failed', error: failure.Error, cause: failure.Cause }
  if (paused.length > 0) {
    const until = paused.flatMap((outcome) => (outcome.kind === 'blocked' ? [outcome.until] : []))
    return paused.some((outcome) => outcome.kind === 'yielded') || until.length === 0 ? { kind: 'yielded' } : { kind: 'blocked', until: new Date(Math.min(...until.map((date) => date.getTime()))) }
  }
  const unended = names.find((name) => !statuses[name])
  if (unended !== undefined) return { kind: 'failed', error: 'States.Runtime', cause: `${unended} never became ready to run` }
  const read = new Set([...dependencies.values()].flatMap((own) => [...dependsOn(own)]))
  const last = names.filter((name) => !read.has(name) && outputs.has(name))
  return { kind: 'ended', output: last.length === 1 ? outputs.get(last[0]!) : Object.fromEntries(last.map((name) => [name, outputs.get(name)])), variables }
}
