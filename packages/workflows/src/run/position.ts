import type { Machine } from '../definition/types'
import type { SavedStep } from './port'

/**
 * Where a scope stands (the whole run, a Map's item or a Parallel's branch), folded from the steps it saved: at a state
 * with its input and variables, or ended with its output, or failed. `seq` numbers its next step.
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
    }
  | { kind: 'ended'; seq: number; output: unknown; variables: Record<string, unknown> }
  | { kind: 'failed'; seq: number; error: string; cause: string }

export const startPosition = (machine: Machine, input: unknown): Position => ({ kind: 'at', seq: 0, state: machine.StartAt, input, variables: {}, attempt: 1, failures: [] })

/** The position after a saved step. */
export const advance = (position: Position, step: SavedStep): Position => {
  if (position.kind !== 'at') return position
  const seq = step.seq + 1
  const variables = { ...position.variables, ...step.assigned }
  if (step.status === 'failed') return { kind: 'failed', seq, error: step.error ?? 'States.Runtime', cause: step.cause ?? '' }
  if (step.status === 'retrying') {
    return { ...position, seq, variables, attempt: position.attempt + 1, failures: [...position.failures, step.error ?? ''], ...(step.resumeAt && { resumeAt: step.resumeAt }) }
  }
  if (step.next === null) return { kind: 'ended', seq, output: step.output, variables }
  return { kind: 'at', seq, state: step.next, input: step.output, variables, attempt: 1, failures: [], ...(step.resumeAt && { resumeAt: step.resumeAt }) }
}

/** Where a scope stands after the steps it saved, in their order. */
export const foldPosition = (machine: Machine, input: unknown, steps: readonly SavedStep[]) => steps.reduce(advance, startPosition(machine, input))
