import { limits } from '../limits'
import type { StepCacheStore } from './cache/cache-port'
import type { LoadedRun, RunStore, SegmentQueue, StepRecord, TaskHandlers, TraceMode, TraceSink } from './port'
import { secretRedactor } from './redact'
import { runSegment } from './segment'

/**
 * The runner's port: where runs are kept, the queue that runs their segments, the step types, the secrets expressions
 * may read by name, which the runner blanks out of all a run records, and where traces go, with the trace a run keeps
 * when neither it nor its definition says (default `all`).
 */
export type RunnerPort<Db> = {
  store: RunStore<Db>
  queue: SegmentQueue<Db>
  tasks: TaskHandlers
  /** Where step types that cache keep their results. */
  cache?: StepCacheStore
  secrets?: Readonly<Record<string, string>>
  trace?: TraceSink
  traceMode?: TraceMode
  now?: () => Date
  budgetMs?: number
  maxSteps?: number
}

const ended = new Set(['succeeded', 'failed'])

/**
 * The workflow runner over a port. `start` queues a run's first segment in `db`, which may be the caller's
 * transaction, so the run starts when it commits; `segment` is what the queue's job runs.
 */
export const createRunner = <Db>({ store, queue, tasks, cache, secrets = {}, trace, traceMode = 'all', now = () => new Date(), budgetMs = limits.segmentMs, maxSteps = limits.runSteps }: RunnerPort<Db>) => {
  // Made once here too, so a secret too short to blank out stops the app at startup.
  secretRedactor(Object.values(secrets))
  return {
    start: (db: Db, runId: string) => queue.schedule(db, runId),

    /** The steps an ended run's trace holds, which a re-run from one of them starts from: undefined when it kept none. */
    readTrace: async (runId: string) => (await trace?.read(runId)) ?? undefined,

    /** Puts the steps a re-run from a step keeps of an earlier run at the start of `run`'s trace, as the run keeps one. */
    keepSteps: (run: Pick<LoadedRun, 'id' | 'definition' | 'trace'>, steps: readonly StepRecord[]) => trace?.write(run.id, steps, { mode: run.trace ?? run.definition.trace ?? traceMode }),

    /**
     * Runs the run from where it stands to its next wait, then queues the next segment or ends the run, and hands the
     * steps it ran to the trace. Run again after a crash, it takes up from each scope's last checkpoint: the steps since
     * run again, recorded calls never.
     */
    segment: async (db: Db, runId: string, signal: AbortSignal) => {
      const run = await store.load(db, runId)
      if (!run || ended.has(run.status)) return
      await store.update(db, runId, { status: 'running' })
      // One per segment, so the tokens its steps were given are blanked from all it records, and kept no longer.
      const redactor = secretRedactor(Object.values(secrets))
      const segment = { runId, definition: run.definition, input: run.input, startedAt: run.startedAt, secrets, redactor, tasks, ...(cache && { cache }), signal, now, budgetMs, maxSteps }
      // A replay takes the steps of the run it replays from that run's trace: none when the run or its trace is gone.
      const replayed = run.replayOf === undefined ? undefined : { definition: run.replayOf?.definition ?? run.definition, steps: run.replayOf ? ((await trace?.read(run.replayOf.id)) ?? []) : [] }
      const outcome = await runSegment({ ...segment, ...(replayed && { replayed }), saved: await store.checkpoints(db, runId), save: (checkpoints) => store.save(db, runId, checkpoints) })
      const mode = run.trace ?? run.definition.trace ?? traceMode
      const traced = (end?: 'succeeded' | 'failed') => trace?.write(runId, outcome.steps, { mode, ...(end && { ended: end }) })
      // The trace is kept before the run goes on or ends, so the next segment's part, or the join, comes after it, and
      // a run seen ended has its whole trace.
      if (outcome.kind === 'superseded') return traced()
      if (outcome.kind === 'ended') {
        await traced('succeeded')
        await store.update(db, runId, { status: 'succeeded', output: redactor.value(outcome.output) })
        return
      }
      if (outcome.kind === 'failed') {
        await traced('failed')
        await store.update(db, runId, { status: 'failed', error: redactor.text(outcome.error), cause: redactor.text(outcome.cause) })
        return
      }
      await traced()
      if (outcome.kind === 'yielded') return queue.schedule(db, runId)
      await store.update(db, runId, { status: 'waiting', resumeAt: outcome.until })
      await queue.schedule(db, runId, outcome.until)
    },
  }
}

export type Runner<Db> = ReturnType<typeof createRunner<Db>>
