import type { TaskState } from '../definition/types'
import type { SegmentContext, StateResult } from './context'
import type { ReplayedStep, StepLog, TaskHandler } from './port'

/** The log line of a step a replay held back, which the run's page marks it by. */
export const heldBackLog = 'Not sent: replay'

const keyOf = (scope: string, seq: number) => `${scope}#${seq}`

export const replayedSteps = (steps: readonly ReplayedStep[]) => new Map(steps.map((step) => [keyOf(step.scope, step.seq), step]))

/** Whether a replay holds back this call: anything but its type saying `false`, it writes. */
export const heldBack = (context: SegmentContext, handler: TaskHandler | undefined, args: unknown) => Boolean(context.replay) && handler?.writes?.(args) !== false

/**
 * A Task a replay holds back: it ends as the replayed run's step of the same scope, number and state ended, with its
 * output and variables, or with a null output and on to its next state when that run has no such step.
 */
export const replayedTask = (context: SegmentContext, state: TaskState, at: { scope: string; seq: number; name: string }, input: unknown, logs: StepLog[]): StateResult => {
  logs.push({ at: context.now().toISOString(), message: heldBackLog })
  const step = context.replay?.steps.get(keyOf(at.scope, at.seq))
  if (!step || step.state !== at.name) return { kind: 'step', status: 'succeeded', next: state.Next ?? null, input, output: null, logs }
  return {
    kind: 'step',
    status: step.status,
    next: step.next,
    input,
    output: step.output ?? null,
    ...(step.assigned && { assigned: step.assigned }),
    ...(step.error != null && { error: step.error }),
    ...(step.cause != null && { cause: step.cause }),
    logs,
  }
}
