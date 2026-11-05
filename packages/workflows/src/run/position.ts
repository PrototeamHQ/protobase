import type { Machine } from '../definition/types'
import type { Checkpoint, StepRecord } from './port'

/**
 * Where a scope stands (the whole run or a Map's item): at a state with its input and variables, or ended with its
 * output, or failed. `seq` numbers its next step; `clock` is what `$now` gives its next steps.
 */
export type Position =
  | {
      kind: 'at'
      seq: number
      state: string
      input: unknown
      variables: Record<string, unknown>
      /** 1 for the first try of the state; more while it retries. */
      attempt: number
      /** The errors of this visit's earlier tries, in order, for the retriers to count. */
      failures: string[]
      /** The state may not run before this time: after a Wait, or a retry's delay. */
      resumeAt?: Date
      clock: Date
    }
  | { kind: 'ended'; seq: number; output: unknown; variables: Record<string, unknown> }
  | { kind: 'failed'; seq: number; error: string; cause: string }

export const startPosition = (machine: Machine, input: unknown, clock: Date): Position => ({ kind: 'at', seq: 0, state: machine.StartAt, input, variables: {}, attempt: 1, failures: [], clock })

/**
 * The position after a step. A recorded step moves the clock to when it ended, and a step with a time to go on at moves
 * it to that time; any other step leaves it, so a step run again after a crash reads the same `$now`.
 */
export const advance = (position: Position, step: StepRecord): Position => {
  if (position.kind !== 'at') return position
  const seq = step.seq + 1
  const variables = { ...position.variables, ...step.assigned }
  const clock = step.resumeAt ?? (step.recorded ? step.finishedAt : position.clock)
  if (step.status === 'failed') return { kind: 'failed', seq, error: step.error ?? 'States.Runtime', cause: step.cause ?? '' }
  if (step.status === 'retrying') {
    return { ...position, seq, variables, attempt: position.attempt + 1, failures: [...position.failures, step.error ?? ''], clock, ...(step.resumeAt && { resumeAt: step.resumeAt }) }
  }
  // A step that gave nothing goes on with null, which is what a checkpoint keeps and gives back.
  const output = step.output === undefined ? null : step.output
  if (step.next === null) return { kind: 'ended', seq, output, variables }
  return { kind: 'at', seq, state: step.next, input: output, variables, attempt: 1, failures: [], clock, ...(step.resumeAt && { resumeAt: step.resumeAt }) }
}

/** The checkpoint of a scope at `position`, after `step`, which made it; `clock` is the scope's before the step. */
export const checkpointOf = (position: Position, step: StepRecord, clock: Date): Omit<Checkpoint, 'after'> => {
  const made = { scope: step.scope, seq: step.seq, state: step.state, type: step.type, status: step.status, fetchedAt: step.finishedAt }
  if (position.kind === 'failed') return { ...made, next: null, variables: {}, attempt: 1, failures: [], clock, error: position.error, cause: position.cause }
  if (position.kind === 'ended') return { ...made, next: null, value: position.output, variables: position.variables, attempt: 1, failures: [], clock }
  return { ...made, next: position.state, value: position.input, variables: position.variables, attempt: position.attempt, failures: position.failures, clock: position.clock, ...(position.resumeAt && { resumeAt: position.resumeAt }) }
}

/** Where a scope stands after its latest checkpoint. */
export const positionOf = (checkpoint: Checkpoint): Position => {
  const seq = checkpoint.seq + 1
  if (checkpoint.next !== null) {
    const { next: state, value: input = null, variables, attempt, failures, clock, resumeAt } = checkpoint
    return { kind: 'at', seq, state, input, variables, attempt, failures, clock, ...(resumeAt && { resumeAt }) }
  }
  if (checkpoint.status === 'failed') return { kind: 'failed', seq, error: checkpoint.error ?? 'States.Runtime', cause: checkpoint.cause ?? '' }
  return { kind: 'ended', seq, output: checkpoint.value ?? null, variables: checkpoint.variables }
}
