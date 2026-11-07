import { limits } from '../limits'
import type { StepCacheStore } from './cache/cache-port'
import type { RunStore, SegmentQueue, TaskHandlers } from './port'
import { secretRedactor } from './redact'
import { runSegment } from './segment'

/**
 * The runner's port: where runs are kept, the queue that runs their segments, the step types, and the secrets
 * expressions may read by name, which the runner blanks out of all a run records.
 */
export type RunnerPort<Db> = {
  store: RunStore<Db>
  queue: SegmentQueue<Db>
  tasks: TaskHandlers
  /** Where step types that cache keep their results. */
  cache?: StepCacheStore
  secrets?: Readonly<Record<string, string>>
  now?: () => Date
  budgetMs?: number
  maxSteps?: number
}

const ended = new Set(['succeeded', 'failed'])

/**
 * The workflow runner over a port. `start` queues a run's first segment in `db`, which may be the caller's
 * transaction, so the run starts when it commits; `segment` is what the queue's job runs.
 */
export const createRunner = <Db>({ store, queue, tasks, cache, secrets = {}, now = () => new Date(), budgetMs = limits.segmentMs, maxSteps = limits.runSteps }: RunnerPort<Db>) => {
  // Made once here too, so a secret too short to blank out stops the app at startup.
  secretRedactor(Object.values(secrets))
  return {
    start: (db: Db, runId: string) => queue.schedule(db, runId),

    /**
     * Runs the run from where it stands to its next wait, then queues the next segment or ends the run. Run again after
     * a crash, it takes up from the last saved step: only the step that was in progress runs again.
     */
    segment: async (db: Db, runId: string, signal: AbortSignal) => {
      const run = await store.load(db, runId)
      if (!run || ended.has(run.status)) return
      await store.update(db, runId, { status: 'running' })
      // One per segment, so the tokens its steps were given are blanked from all it records, and kept no longer.
      const redactor = secretRedactor(Object.values(secrets))
      const segment = { runId, definition: run.definition, input: run.input, startedAt: run.startedAt, secrets, redactor, tasks, ...(cache && { cache }), signal, now, budgetMs, maxSteps }
      // A replay's flag is the run's own: when the steps it replays cannot be read, the segment fails before any state runs.
      const replayed = run.replayOf === undefined ? undefined : run.replayOf === null ? [] : await store.steps(db, run.replayOf)
      const outcome = await runSegment({ ...segment, ...(replayed && { replayed }), saved: await store.steps(db, runId), save: (steps) => store.save(db, runId, steps) })
      if (outcome.kind === 'superseded') return
      if (outcome.kind === 'ended') return store.update(db, runId, { status: 'succeeded', output: redactor.value(outcome.output) })
      if (outcome.kind === 'failed') return store.update(db, runId, { status: 'failed', error: redactor.text(outcome.error), cause: redactor.text(outcome.cause) })
      if (outcome.kind === 'yielded') return queue.schedule(db, runId)
      await store.update(db, runId, { status: 'waiting', resumeAt: outcome.until })
      await queue.schedule(db, runId, outcome.until)
    },
  }
}

export type Runner<Db> = ReturnType<typeof createRunner<Db>>
