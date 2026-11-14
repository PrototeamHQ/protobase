import type { Catcher, Retrier } from '../definition/types'
import { limits } from '../limits'
import type { StateResult } from './context'
import { evaluateAssign, evaluateKept, type Bindings } from './evaluate'
import { matches, StepError, type ErrorOutput } from './errors'
import type { Position } from './position'
import type { StepLog } from './port'

type Recoverable = { Retry?: Retrier[]; Catch?: Catcher[] }

/**
 * The wait before a retry: `IntervalSeconds` times `BackoffRate` for each earlier retry, up to `MaxDelaySeconds`, and
 * never more than `limits.retryDelaySeconds`, which is also the cap when the retrier names none.
 */
export const retryDelaySeconds = (retrier: Retrier, retries: number) => {
  const delay = (retrier.IntervalSeconds ?? 1) * (retrier.BackoffRate ?? 2) ** retries
  return Math.min(delay, retrier.MaxDelaySeconds ?? limits.retryDelaySeconds)
}

/**
 * The variable a catcher without `Next` keeps the error it caught in, which a dataflow state's Status reads: a name no
 * definition can assign, as an assigned name starts with a letter.
 */
export const caughtVariable = '__caught'

// A catcher with `Next` goes on there; one without, in dataflow order, ends its state's scope with the error kept.
const caught = async (catcher: Catcher, failure: ErrorOutput, bindings: Bindings, logs: StepLog[]): Promise<StateResult> => {
  const after = { ...bindings, states: { ...(bindings.states as object), errorOutput: failure } }
  const output = catcher.Output === undefined ? failure : await evaluateKept(catcher.Output, after, 'Output')
  const assigned = await evaluateAssign(catcher.Assign, after)
  if (catcher.Next !== undefined) return { kind: 'step', status: 'caught', next: catcher.Next, output, assigned, error: failure.Error, cause: failure.Cause, logs }
  return { kind: 'step', status: 'caught', next: null, output, assigned: { ...assigned, [caughtVariable]: failure }, error: failure.Error, cause: failure.Cause, logs }
}

/**
 * What a failed Task or Map does: the first retrier that names its error tries it again after its delay
 * while it has tries left; else the first catcher that names it goes on to its `Next`; else the state fails.
 */
export const recover = async (state: Recoverable, position: Extract<Position, { kind: 'at' }>, failure: ErrorOutput, bindings: Bindings, now: Date, logs: StepLog[]): Promise<StateResult> => {
  const retriers = state.Retry ?? []
  const retrierOf = (error: string) => retriers.findIndex((retrier) => matches(retrier.ErrorEquals, error))
  const index = retrierOf(failure.Error)
  if (index >= 0) {
    const retrier = retriers[index]!
    const retries = position.failures.filter((error) => retrierOf(error) === index).length
    if (retries < (retrier.MaxAttempts ?? 3)) {
      const resumeAt = new Date(now.getTime() + retryDelaySeconds(retrier, retries) * 1000)
      return { kind: 'step', status: 'retrying', next: null, resumeAt, error: failure.Error, cause: failure.Cause, logs }
    }
  }
  const catcher = (state.Catch ?? []).find((candidate) => matches(candidate.ErrorEquals, failure.Error))
  if (!catcher) return { kind: 'step', status: 'failed', next: null, error: failure.Error, cause: failure.Cause, logs }
  return caught(catcher, failure, bindings, logs).catch((error: unknown) => {
    if (!(error instanceof StepError)) throw error
    return { kind: 'step', status: 'failed', next: null, error: error.error, cause: error.reason, logs }
  })
}
