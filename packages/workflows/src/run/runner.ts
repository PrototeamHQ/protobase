import { limits } from '../limits'
import type { StepCacheStore } from './cache/cache-port'
import { blockDefinition } from '../definition/inner'
import type { BlockRunStore, BlockShare, LoadedRun, RunStore, SegmentQueue, StepRecord, TaskHandlers, TraceMode, TraceSink } from './port'
import { blankedMark, secretRedactor } from './redact'
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
  /** Where step types that cache keep their results, and Blocks theirs. */
  cache?: StepCacheStore
  /** Where blocks' runs are kept; without it a Block fails. */
  blocks?: BlockRunStore<Db>
  secrets?: Readonly<Record<string, string>>
  trace?: TraceSink
  traceMode?: TraceMode
  now?: () => Date
  budgetMs?: number
  maxSteps?: number
}

const ended = new Set(['succeeded', 'failed'])

// The definition a run runs: a block's run, its Block's processor, which a version without that Block does not have.
const runDefinition = (run: Pick<LoadedRun, 'definition' | 'blockState'>, definition = run.definition) => (run.blockState ? blockDefinition(definition, run.blockState) : definition)

// Whether a run's output held a secret: each step blanks its own before the run goes on, so the mark is all that tells.
// An output that holds the mark's text itself counts too, which only keeps a block's result from being cached.
const blankedOut = (output: unknown) => (JSON.stringify(output) ?? '').includes(blankedMark)

/**
 * The workflow runner over a port. `start` queues a run's first segment in `db`, which may be the caller's
 * transaction, so the run starts when it commits; `segment` is what the queue's job runs.
 */
export const createRunner = <Db>({ store, queue, tasks, cache, blocks, secrets = {}, trace, traceMode = 'all', now = () => new Date(), budgetMs = limits.segmentMs, maxSteps = limits.runSteps }: RunnerPort<Db>) => {
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
      if (!run) return
      // A block's run wakes the run that started it and those that joined it as it ends; again on a later try, should it
      // have stopped before. It reads them after it ended, so a run joining it meanwhile finds it ended instead.
      const wake = async () => {
        if (run.blockOf) await queue.wake(db, run.blockOf)
        for (const parent of (await blocks?.waiters(db, runId)) ?? []) await queue.wake(db, parent)
      }
      if (ended.has(run.status)) return wake()
      await store.update(db, runId, { status: 'running' })
      const definition = runDefinition(run)
      if (!definition) {
        await store.update(db, runId, { status: 'failed', error: 'States.Runtime', cause: `The Block "${run.blockState}" is not in this version of the workflow` })
        return wake()
      }
      // One per segment, so the tokens its steps were given are blanked from all it records, and kept no longer.
      const redactor = secretRedactor(Object.values(secrets))
      const blockRuns = blocks && { find: (visit: string) => blocks.find(db, runId, visit), start: (block: { visit: string; state: string; input: unknown; share?: BlockShare; joinOnly?: true }) => blocks.start(db, { parent: runId, ...block }), count: () => blocks.count(db, runId) }
      const segment = { runId, definition, input: run.input, startedAt: run.startedAt, secrets, redactor, tasks, ...(cache && { cache }), ...(blockRuns && { blocks: blockRuns }), signal, now, budgetMs, maxSteps }
      // A replay takes the steps of the run it replays from that run's trace: none when the run or its trace is gone.
      const replayed = run.replayOf === undefined ? undefined : { definition: runDefinition(run, run.replayOf?.definition) ?? definition, steps: run.replayOf ? ((await trace?.read(run.replayOf.id)) ?? []) : [] }
      const mode = run.trace ?? run.definition.trace ?? traceMode
      const keep = async (steps: readonly StepRecord[]) => void (await trace?.write(runId, steps, { mode }))
      const outcome = await runSegment({ ...segment, ...(replayed && { replayed }), saved: await store.checkpoints(db, runId), save: (checkpoints) => store.save(db, runId, checkpoints), keep })
      const traced = async (end?: 'succeeded' | 'failed') => {
        if (!end && outcome.steps.length === 0) return
        await trace?.write(runId, outcome.steps, { mode, ...(end && { ended: end }) })
      }
      // The steps since the segment's last checkpoint are kept before the run goes on or ends, so the next segment's
      // part, or the join, comes after them, and a run seen ended has its whole trace.
      if (outcome.kind === 'superseded') return traced()
      if (outcome.kind === 'ended') {
        await traced('succeeded')
        const output = redactor.value(outcome.output)
        await store.update(db, runId, { status: 'succeeded', output, blanked: blankedOut(output) })
        return wake()
      }
      if (outcome.kind === 'failed') {
        await traced('failed')
        await store.update(db, runId, { status: 'failed', error: redactor.text(outcome.error), cause: redactor.text(outcome.cause) })
        return wake()
      }
      await traced()
      if (outcome.kind === 'yielded') return queue.schedule(db, runId)
      await store.update(db, runId, { status: 'waiting', resumeAt: outcome.until })
      await queue.schedule(db, runId, outcome.until)
    },
  }
}

export type Runner<Db> = ReturnType<typeof createRunner<Db>>
