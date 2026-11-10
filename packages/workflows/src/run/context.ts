import type { BlockRun, Checkpoint, StepLog, StepRecord, TaskHandlers } from './port'
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
  /** This run's blocks' runs, by the try of a Block (`visit`) that started each. */
  blocks?: SegmentBlocks
  /** The job's signal: aborted when the worker stops, which ends the segment without saving the step in progress. */
  signal: AbortSignal
  now: () => Date
  /** When the segment stops taking new steps and hands the rest to the next one, as `Date.now()` counts. */
  deadline: number
  /** The latest checkpoint of each scope, saved before this segment. */
  saved: ReadonlyMap<string, Checkpoint>
  /**
   * Keeps where a scope stands, replacing what it kept before; with `now`, saves it and every other scope's kept one in
   * one write, throwing `SupersededError` when another segment saved a newer checkpoint of one of them first.
   */
  checkpoint: (checkpoint: Omit<Checkpoint, 'after'>, now: boolean) => Promise<void>
  /** Adds a step to the segment's trace. */
  trace: (step: StepRecord) => void
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
      /** A Task whose call is recorded: it changes the world. */
      recorded?: boolean
      /** When a recorded Task's result was fetched. */
      fetchedAt?: Date
      /** A Block's: the block's run that gave its result, and whether that result was an earlier one the cache kept. */
      run?: string
      reused?: true
    }
  | Paused

/** A scope that cannot go on in this segment: it waits until a time, or the segment's time is up. */
export type Paused = { kind: 'blocked'; until: Date } | { kind: 'yielded' }

/** How a scope ended in this segment. */
export type ScopeOutcome = { kind: 'ended'; output: unknown } | { kind: 'failed'; error: string; cause: string } | Paused

/** A run's blocks' runs, as its segment reaches them. */
export type SegmentBlocks = {
  find: (visit: string) => Promise<BlockRun | undefined>
  start: (run: { visit: string; state: string; input: unknown }) => Promise<BlockRun | undefined>
  count: () => Promise<number>
}
