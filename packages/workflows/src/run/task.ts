import type { TaskState } from '../definition/types'
import { limits } from '../limits'
import type { SegmentContext } from './context'
import { StepError, SupersededError } from './errors'
import type { StepLog } from './port'

const aborted = (signal: AbortSignal) =>
  new Promise<never>((_, reject) => {
    if (signal.aborted) return reject(signal.reason)
    signal.addEventListener('abort', () => reject(signal.reason), { once: true })
  })

/**
 * Runs a Task's step type with its arguments, within its `TimeoutSeconds`: its result, or a `StepError` naming why it
 * failed (`States.Timeout` when the time ran out, `States.TaskFailed` for an error of no name of its own). When the
 * worker stops, the abort is thrown as it is, so the step is not saved and runs again in the next segment.
 */
export const runTask = async (context: SegmentContext, state: TaskState, args: unknown, idempotencyKey: string, logs: StepLog[]) => {
  const handler = context.tasks[state.Resource]
  if (!handler) throw new StepError('States.Runtime', `"${state.Resource}" is not a step type of this app`)
  const timeout = AbortSignal.timeout((state.TimeoutSeconds ?? limits.defaultTaskTimeoutSeconds) * 1000)
  const signal = AbortSignal.any([context.signal, timeout])
  const log = (message: string) => void logs.push({ at: context.now().toISOString(), message })
  // A worker that stopped already starts no step: it would run unsaved, and run again in the next segment.
  context.signal.throwIfAborted()
  try {
    return await Promise.race([handler(args, { runId: context.runId, signal, idempotencyKey, log, redact: context.redactor.text }), aborted(signal)])
  } catch (error) {
    if (context.signal.aborted || error instanceof SupersededError) throw error
    if (timeout.aborted) throw new StepError('States.Timeout', `The step ran longer than ${state.TimeoutSeconds ?? limits.defaultTaskTimeoutSeconds} seconds`)
    if (error instanceof StepError) throw error
    // Any other error the step type throws is the step's failure, under the error name every Retry and Catch knows.
    throw new StepError('States.TaskFailed', error instanceof Error ? error.message : String(error))
  }
}
