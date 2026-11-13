import type { Definition } from '../definition/types'
import type { CacheIdentity, StepCacheStore } from './cache/cache-port'
import { canonicalJson } from './cache/canonical'
import { createRunner } from './runner'
import { findBlock } from '../definition/inner'
import type { BlockRun, BlockRunStore, Checkpoint, LoadedRun, RunStore, StepRecord, TaskHandlers, TraceMode, TraceSink } from './port'
import { rerunCheckpoint, rerunProblem } from './rerun'
import { rerunFrom } from './rerun-from'

type MemoryOptions = { budgetMs?: number; secrets?: Record<string, string>; maxSteps?: number; traceMode?: TraceMode; cache?: StepCacheStore; whoOf?: (runId: string, identity: CacheIdentity) => unknown }

/**
 * The runner over a port kept in memory, with a clock tests move: for the package's unit tests. `drain` runs a run's
 * segments as the queue would, moving the clock to each wait's end, until nothing is queued. `checkpoints` is what the
 * database would hold (a failed run keeps them), `writes` the checkpoints each save took, and `steps` every step the runs' kept traces hold.
 * `whoOf` says who a run's call acts as, as the step cache's does, so a block's run is shared only by runs of one identity.
 */
export const memoryRunner = (tasks: TaskHandlers, { budgetMs, secrets, maxSteps, traceMode, cache, whoOf = () => ({}) }: MemoryOptions = {}) => {
  let clock = new Date('2026-11-04T12:00:00Z')
  const runs = new Map<string, LoadedRun & Record<string, unknown>>()
  const checkpoints: (Checkpoint & { runId: string })[] = []
  const queued: { runId: string; at?: Date }[] = []
  const writes: number[] = []
  const traces = new Map<string, StepRecord[][]>()
  const store: RunStore<null> = {
    load: async (_, id) => runs.get(id),
    checkpoints: async (_, runId) => checkpoints.filter((saved) => saved.runId === runId).map((saved) => structuredClone(saved)),
    save: async (_, runId, records) => {
      writes.push(records.length)
      const newer = (checkpoint: Checkpoint) => checkpoints.some((saved) => saved.runId === runId && saved.scope === checkpoint.scope && saved.seq > checkpoint.after)
      if (records.some(newer)) return false
      for (const record of records) {
        const index = checkpoints.findIndex((saved) => saved.runId === runId && saved.scope === record.scope)
        if (index >= 0) checkpoints.splice(index, 1)
        checkpoints.push({ ...structuredClone(record), runId })
      }
      return true
    },
    update: async (_, id, change) => {
      const run = runs.get(id)!
      if (run.status === 'succeeded' || run.status === 'failed') return
      runs.set(id, { ...run, ...change, ...((change.status === 'succeeded' || change.status === 'failed') && { finishedAt: clock }) })
      // A failed run keeps its checkpoints, for a re-run to go on from.
      if (change.status !== 'succeeded') return
      for (let index = checkpoints.length - 1; index >= 0; index--) if (checkpoints[index]!.runId === id) checkpoints.splice(index, 1)
    },
  }
  // Each segment's steps as a part of its run's trace; a run kept only when it fails drops its parts when it succeeds.
  const trace: TraceSink = {
    write: async (runId, steps, { mode, ended }) => {
      if (mode === 'none') return
      if (mode === 'failed' && ended === 'succeeded') return void traces.delete(runId)
      if (steps.length > 0) traces.set(runId, [...(traces.get(runId) ?? []), structuredClone([...steps])])
    },
    read: async (runId) => traces.get(runId)?.flat(),
  }
  const schedule = async (_: null, runId: string, at?: Date) => void queued.push({ runId, ...(at && { at }) })
  // As the jobs' `replace`: the run's waiting segment, if any, runs now.
  const wake = async (_: null, runId: string) => {
    for (let index = queued.length - 1; index >= 0; index--) if (queued[index]!.runId === runId) queued.splice(index, 1)
    queued.push({ runId })
  }
  // A block's run is a run of its parent's definition and trace setting, found again by the parent and its try's visit,
  // or, for a visit that joined it, by that visit's waiter.
  const blockRun = (run: LoadedRun & Record<string, unknown>): BlockRun => ({ id: run.id, status: run.status, output: run.output, error: run.error as string | undefined, cause: run.cause as string | undefined, finishedAt: run.finishedAt as Date | undefined, blanked: run.blanked as boolean | undefined })
  const waiters: { run: string; parent: string; visit: string }[] = []
  const own = (parent: string, visit: string) => [...runs.values()].find((run) => run.blockOf === parent && run.blockVisit === visit)
  const blocks: BlockRunStore<null> = {
    find: async (_, parent, visit) => {
      const found = own(parent, visit)
      if (found) return blockRun(found)
      const waiter = waiters.find((one) => one.parent === parent && one.visit === visit)
      return waiter && { ...blockRun(runs.get(waiter.run)!), joined: true }
    },
    start: async (_, { parent, visit, state, input, share, joinOnly }) => {
      const found = own(parent, visit)
      if (found) return blockRun(found)
      const of = runs.get(parent)!
      if (!findBlock(of.definition.stateMachine, state)) return
      const who = share && canonicalJson(whoOf(parent, share.identity) ?? null)
      const under = share && [...runs.values()].find((run) => run.blockKey === share.key && run.blockWho === who && !(run.status === 'succeeded' || run.status === 'failed'))
      if (under) {
        if (!waiters.some((one) => one.parent === parent && one.visit === visit)) waiters.push({ run: under.id, parent, visit })
        return { ...blockRun(under), joined: true }
      }
      if (joinOnly) return
      const id = `${parent}~${visit}`
      runs.set(id, { id, definition: of.definition, input: structuredClone(input), status: 'queued', startedAt: clock, blockOf: parent, blockState: state, blockVisit: visit, ...(of.trace && { trace: of.trace }), ...(share && { blockKey: share.key, blockWho: who }) })
      await schedule(null, id)
      return blockRun(runs.get(id)!)
    },
    waiters: async (_, run) => waiters.filter((one) => one.run === run).map((one) => one.parent),
    count: async (_, parent) => [...runs.values()].filter((run) => run.blockOf === parent).length,
  }
  const runner = createRunner({ store, queue: { schedule, wake }, blocks, tasks, trace, now: () => clock, ...(traceMode && { traceMode }), ...(budgetMs !== undefined && { budgetMs }), ...(secrets && { secrets }), ...(maxSteps !== undefined && { maxSteps }), ...(cache && { cache }) })
  return {
    runner,
    store,
    blocks,
    checkpoints,
    writes,
    traces,
    get steps() {
      return [...traces].flatMap(([runId, parts]) => parts.flat().map((step) => ({ ...step, runId })))
    },
    run: (id: string) => runs.get(id)!,
    now: () => clock,
    start: async (id: string, definition: Definition, input: unknown, trace?: TraceMode) => {
      runs.set(id, { id, definition, input, status: 'queued', startedAt: clock, ...(trace && { trace }) })
      await runner.start(null, id)
    },
    /**
     * Re-runs the failed run `earlier` as `id` on `definition`, with its input, from its checkpoints; or, with `from`, the
     * ended run from that state, from its trace, whose steps before it the re-run's trace keeps.
     */
    rerun: async (id: string, earlier: string, definition: Definition, from?: string) => {
      if (from === undefined) {
        const kept = checkpoints.filter((saved) => saved.runId === earlier)
        const problem = rerunProblem(definition.stateMachine, kept)
        if (problem) throw new Error(problem)
        checkpoints.push(...kept.map((saved) => ({ ...rerunCheckpoint(structuredClone(saved), clock), runId: id })))
      } else {
        const ran = await trace.read(earlier)
        if (!ran) throw new Error('The run kept no trace')
        const found = rerunFrom(definition.stateMachine, runs.get(earlier)!.definition.stateMachine, structuredClone(ran), from, clock)
        if ('problem' in found) throw new Error(found.problem)
        if (found.checkpoint) checkpoints.push({ ...found.checkpoint, runId: id })
        trace.write(id, found.kept, { mode: traceMode ?? 'all' })
      }
      runs.set(id, { id, definition, input: runs.get(earlier)!.input, status: 'queued', startedAt: clock })
      await runner.start(null, id)
    },
    /** Replays the run `of` as `id` on `definition` from its start, with its input. */
    replay: async (id: string, of: string, definition: Definition) => {
      const replayed = runs.get(of)!
      runs.set(id, { id, definition, input: replayed.input, status: 'queued', startedAt: clock, replayOf: { id: of, definition: replayed.definition }, ...(replayed.blockState && { blockState: replayed.blockState }) })
      await runner.start(null, id)
    },
    /** Runs one queued segment, moving the clock to its time; false when none is queued. */
    step: async (signal = new AbortController().signal) => {
      const next = queued.shift()
      if (!next) return false
      if (next.at && next.at > clock) clock = next.at
      await runner.segment(null, next.runId, signal)
      return true
    },
    /** Moves the clock on, as time passing between segments. */
    tick: (ms: number) => {
      clock = new Date(clock.getTime() + ms)
    },
    drain: async function () {
      for (let segments = 0; await this.step(); segments++) if (segments > 1000) throw new Error('The run did not settle')
    },
  }
}
