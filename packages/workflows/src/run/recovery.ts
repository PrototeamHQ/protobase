import type { Catcher, Retrier } from '../definition/types'
import type { StateResult } from './context'
import { evaluateAssign, evaluateTemplate, type Bindings } from './evaluate'
import { matches, StepError, type ErrorOutput } from './errors'
import type { Position } from './position'
import type { StepLog } from './port'

type Recoverable = { Retry?: Retrier[]; Catch?: Catcher[] }

/** The wait before a retry: `IntervalSeconds` times `BackoffRate` for each earlier retry, up to `MaxDelaySeconds`. */
export const retryDelaySeconds = (retrier: Retrier, retries: number) => {
  const delay = (retrier.IntervalSeconds ?? 1) * (retrier.BackoffRate ?? 2) ** retries
  return retrier.MaxDelaySeconds === undefined ? delay : Math.min(delay, retrier.MaxDelaySeconds)
}

const caught = async (catcher: Catcher, failure: ErrorOutput, bindings: Bindings, logs: StepLog[]): Promise<StateResult> => {
  const after = { ...bindings, states: { errorOutput: failure } }
  const output = catcher.Output === undefined ? failure : await evaluateTemplate(catcher.Output, after, 'Output')
  return { kind: 'step', status: 'caught', next: catcher.Next, output, assigned: await evaluateAssign(catcher.Assign, after), error: failure.Error, cause: failure.Cause, logs }
}

/**
 * What a failed Task, Map or Parallel does: the first retrier that names its error tries it again after its delay
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
