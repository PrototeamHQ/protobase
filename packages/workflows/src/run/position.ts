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
      /** The visits of each state this scope began so far, the current one's included once it took its first try. */
      visits: Record<string, number>
      /** The state may not run before this time: after a Wait, or a retry's delay. */
      resumeAt?: Date
      clock: Date
    }
  | {
      kind: 'ended'
      seq: number
      output: unknown
      variables: Record<string, unknown>
      /** The scope may not end before this time: its last state was a Wait. */
      resumeAt?: Date
    }
  | { kind: 'failed'; seq: number; error: string; cause: string }

export const startPosition = (machine: Machine, input: unknown, clock: Date): Position => ({ kind: 'at', seq: 0, state: machine.StartAt, input, variables: {}, attempt: 1, failures: [], visits: {}, clock })

/**
 * The position after a step. A recorded step moves the clock to when it ended, and a step with a time to go on at moves
 * it to that time; any other step leaves it, so a step run again after a crash reads the same `$now`.
 */
export const advance = (position: Position, step: StepRecord): Position => {
  if (position.kind !== 'at') return position
  const seq = step.seq + 1
  const variables = { ...position.variables, ...step.assigned }
  const clock = step.resumeAt ?? (step.recorded ? step.finishedAt : position.clock)
  const visits = step.attempt === 1 ? { ...position.visits, [step.state]: (position.visits[step.state] ?? 0) + 1 } : position.visits
  if (step.status === 'failed') return { kind: 'failed', seq, error: step.error ?? 'States.Runtime', cause: step.cause ?? '' }
  if (step.status === 'retrying') {
    return { ...position, seq, variables, visits, attempt: position.attempt + 1, failures: [...position.failures, step.error ?? ''], clock, ...(step.resumeAt && { resumeAt: step.resumeAt }) }
  }
  // A step that gave nothing goes on with null, which is what a checkpoint keeps and gives back.
  const output = step.output === undefined ? null : step.output
  if (step.next === null) return { kind: 'ended', seq, output, variables, ...(step.resumeAt && { resumeAt: step.resumeAt }) }
  return { kind: 'at', seq, state: step.next, input: output, variables, attempt: 1, failures: [], visits, clock, ...(step.resumeAt && { resumeAt: step.resumeAt }) }
}

/** Which visit of its state the step at `position` belongs to, from 0: a retry's visit began with its first try. */
export const visitOf = (position: Extract<Position, { kind: 'at' }>) => (position.visits[position.state] ?? 0) - (position.attempt > 1 ? 1 : 0)

/** The checkpoint of a scope at `position`, after `step`, which made it; `clock` is the scope's before the step. */
export const checkpointOf = (position: Exclude<Position, { kind: 'failed' }>, step: StepRecord, clock: Date): Omit<Checkpoint, 'after'> => {
  const made = { scope: step.scope, seq: step.seq, state: step.state, type: step.type, status: step.status, fetchedAt: step.finishedAt }
  if (position.kind === 'ended') return { ...made, next: null, value: position.output, variables: position.variables, attempt: 1, failures: [], visits: {}, clock, ...(position.resumeAt && { resumeAt: position.resumeAt }) }
  return { ...made, next: position.state, value: position.input, variables: position.variables, attempt: position.attempt, failures: position.failures, visits: position.visits, clock: position.clock, ...(position.resumeAt && { resumeAt: position.resumeAt }) }
}

/** Where a scope stands after its latest checkpoint. */
export const positionOf = (checkpoint: Checkpoint): Position => {
  const seq = checkpoint.seq + 1
  if (checkpoint.next !== null) {
    const { next: state, value: input = null, variables, attempt, failures, visits, clock, resumeAt } = checkpoint
    return { kind: 'at', seq, state, input, variables, attempt, failures, visits, clock, ...(resumeAt && { resumeAt }) }
  }
  return { kind: 'ended', seq, output: checkpoint.value ?? null, variables: checkpoint.variables, ...(checkpoint.resumeAt && { resumeAt: checkpoint.resumeAt }) }
}
