import type { SavedStep, StepLog, StepRecord, TaskHandlers } from './port'
import type { Redactor } from './redact'
import type { StepCacheStore } from './cache/cache-port'
import type { SecretNamer } from './cache/secret-names'
import type { Replay } from './replay-of'

/** What every scope of one segment shares. */
export type SegmentContext = {
  runId: string
  /** What expressions read as `$states.context`: the run's input and start time, and the secrets by name. */
  stateContext: { Execution: { Input: unknown; StartTime: string }; Secrets: Readonly<Record<string, string>> }
  redactor: Redactor
  tasks: TaskHandlers
  /** Where step types that cache keep their results, and the namer of the secrets in their keys. */
  cache?: { store: StepCacheStore; nameSecrets: SecretNamer }
  /**
   * In a replay, what it matches its steps with the run it replays by: a Task whose type writes gives what that run's
   * step of the same state and visit gave instead of running, and a Wait does not wait.
   */
  replay?: Replay
  /** The job's signal: aborted when the worker stops, which ends the segment without saving the step in progress. */
  signal: AbortSignal
  now: () => Date
  /** When the segment stops taking new steps and hands the rest to the next one, as `Date.now()` counts. */
  deadline: number
  /** The steps saved before this segment, by scope, in order. */
  saved: ReadonlyMap<string, readonly SavedStep[]>
  /**
   * Keeps a step to save with the next checkpoint; a checkpoint saves it with every step kept before it, in one write,
   * throwing `SupersededError` when another segment saved one of them first.
   */
  save: (step: StepRecord, checkpoint: boolean) => Promise<void>
  /** Whether a save found another segment ahead, so no scope of this one takes another step. */
  superseded: () => boolean
  /** Steps of the run so far, the saved ones and this segment's, and the most it may take. */
  steps: { count: number }
  maxSteps: number
}

/** How a scope's state ran: a step to save, or a Map that waits on its items. */
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
