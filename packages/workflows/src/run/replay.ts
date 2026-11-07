import type { Machine, State, TaskState } from '../definition/types'
import type { SegmentContext, StateResult } from './context'
import type { StepLog, TaskHandler } from './port'
import { mapNames, matchKey } from './replay-match'
import type { Replay } from './replay-of'

/** The log line of a step a replay held back, which the run's page marks it by. */
export const heldBackLog = 'Not sent: replay'

/** Whether a replay holds back this call: anything but its type saying `false`, it writes. */
export const heldBack = (context: SegmentContext, handler: TaskHandler | undefined, args: unknown) => Boolean(context.replay) && handler?.writes?.(args) !== false

/** The replayed run's state of this name in the scope of these Map names. */
const stateIn = (machine: Machine, maps: readonly string[], name: string): State | undefined => {
  let inner: Machine | undefined = machine
  for (const map of maps) {
    const state: State | undefined = inner?.States[map]
    inner = state?.Type === 'Map' ? state.ItemProcessor : undefined
  }
  return inner?.States[name]
}

/**
 * What a held-back step takes from the replayed run's step of the same state and visit of it in the same scope: its
 * error, or its result, which only a Task that did not shape it with `Output` saved as it was. Undefined when that
 * run has no such step, its step was still retrying, or saved its result shaped.
 */
export const replayedOutcome = (replay: Replay, at: { scope: string; seq: number; name: string }) => {
  const key = matchKey(replay.seen, at.scope, at.name, at.seq)
  const step = key === undefined ? undefined : replay.outcomes.get(key)
  if (!step || step.status === 'retrying') return
  if (step.status !== 'succeeded') return { failure: { Error: step.error ?? 'States.Runtime', Cause: step.cause ?? '' } }
  const state = stateIn(replay.machine, mapNames(at.scope), at.name)
  if (state?.Type !== 'Task' || state.Output !== undefined) return
  return { result: step.output ?? null }
}

/** A held-back step the replayed run gave nothing for: a null output, on to its next state. */
export const emptyTask = (state: TaskState, input: unknown, logs: StepLog[]): StateResult => ({ kind: 'step', status: 'succeeded', next: state.Next ?? null, input, output: null, logs })
