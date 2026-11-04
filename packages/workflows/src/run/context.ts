import type { SavedStep, StepLog, StepRecord, TaskHandlers } from './port'

/** What every scope of one segment shares. */
export type SegmentContext = {
  runId: string
  /** The run's input, read as `$trigger`. */
  trigger: unknown
  tasks: TaskHandlers
  /** The job's signal: aborted when the worker stops, which ends the segment without saving the step in progress. */
  signal: AbortSignal
  now: () => Date
  /** When the segment stops taking new steps and hands the rest to the next one, as `Date.now()` counts. */
  deadline: number
  /** The steps saved before this segment, by scope, in order. */
  saved: ReadonlyMap<string, readonly SavedStep[]>
  /** Saves a step, throwing `SupersededError` when another segment saved it first. */
  save: (step: StepRecord) => Promise<void>
  /** Steps of the run so far, the saved ones and this segment's. */
  steps: { count: number }
}

/** How a scope's state ran: a step to save, or a Map or Parallel that waits on its items. */
export type StateResult =
  | {
      kind: 'step'
      status: StepRecord['status']
      next: string | null
      input?: unknown
      output?: unknown
      assigned?: Record<string, unknown>
      resumeAt?: Date
      error?: string
      cause?: string
      logs: StepLog[]
    }
  | Paused

/** A scope that cannot go on in this segment: it waits until a time, or the segment's time is up. */
export type Paused = { kind: 'blocked'; until: Date } | { kind: 'yielded' }

/** How a scope ended in this segment. */
export type ScopeOutcome = { kind: 'ended'; output: unknown } | { kind: 'failed'; error: string; cause: string } | Paused
