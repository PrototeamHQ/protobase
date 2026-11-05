import { limits } from '../limits'
import type { RunStore, SegmentQueue, TaskHandlers, TraceMode, TraceSink } from './port'
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
export const createRunner = <Db>({ store, queue, tasks, secrets = {}, trace, traceMode = 'all', now = () => new Date(), budgetMs = limits.segmentMs, maxSteps = limits.runSteps }: RunnerPort<Db>) => {
  const redactor = secretRedactor(Object.values(secrets))
  return {
    start: (db: Db, runId: string) => queue.schedule(db, runId),

    /**
     * Runs the run from where it stands to its next wait, then queues the next segment or ends the run, and hands the
     * steps it ran to the trace. Run again after a crash, it takes up from each scope's last checkpoint: the steps since
     * run again, recorded calls never.
     */
    segment: async (db: Db, runId: string, signal: AbortSignal) => {
      const run = await store.load(db, runId)
      if (!run || ended.has(run.status)) return
      await store.update(db, runId, { status: 'running' })
      const segment = { runId, definition: run.definition, input: run.input, startedAt: run.startedAt, secrets, redactor, tasks, signal, now, budgetMs, maxSteps }
      const outcome = await runSegment({ ...segment, saved: await store.checkpoints(db, runId), save: (checkpoints) => store.save(db, runId, checkpoints) })
      const mode = run.trace ?? run.definition.trace ?? traceMode
      const traced = (end?: 'succeeded' | 'failed') => trace?.write(runId, outcome.steps, { mode, ...(end && { ended: end }) })
      if (outcome.kind === 'superseded') return traced()
      if (outcome.kind === 'ended') {
        await store.update(db, runId, { status: 'succeeded', output: redactor.value(outcome.output) })
        return traced('succeeded')
      }
      if (outcome.kind === 'failed') {
        await store.update(db, runId, { status: 'failed', error: redactor.text(outcome.error), cause: redactor.text(outcome.cause) })
        return traced('failed')
      }
      if (outcome.kind === 'yielded') await queue.schedule(db, runId)
      else {
        await store.update(db, runId, { status: 'waiting', resumeAt: outcome.until })
        await queue.schedule(db, runId, outcome.until)
      }
      traced()
    },
  }
}

export type Runner<Db> = ReturnType<typeof createRunner<Db>>
