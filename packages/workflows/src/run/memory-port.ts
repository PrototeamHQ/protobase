import type { Definition } from '../definition/types'
import type { StepCacheStore } from './cache/cache-port'
import { createRunner } from './runner'
import type { Checkpoint, LoadedRun, RunStore, StepRecord, TaskHandlers, TraceMode, TraceSink } from './port'
import { rerunCheckpoint, rerunProblem } from './rerun'

type MemoryOptions = { budgetMs?: number; secrets?: Record<string, string>; maxSteps?: number; traceMode?: TraceMode; cache?: StepCacheStore }

/**
 * The runner over a port kept in memory, with a clock tests move: for the package's unit tests. `drain` runs a run's
 * segments as the queue would, moving the clock to each wait's end, until nothing is queued. `checkpoints` is what the
 * database would hold (a failed run keeps them), `writes` the checkpoints each save took, and `steps` every step the runs' kept traces hold.
 */
export const memoryRunner = (tasks: TaskHandlers, { budgetMs, secrets, maxSteps, traceMode, cache }: MemoryOptions = {}) => {
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
      runs.set(id, { ...run, ...change })
      // A failed run keeps its checkpoints, for a re-run to go on from.
      if (change.status !== 'succeeded') return
      for (let index = checkpoints.length - 1; index >= 0; index--) if (checkpoints[index]!.runId === id) checkpoints.splice(index, 1)
    },
  }
  // Each segment's steps as a part of its run's trace; a run kept only when it fails drops its parts when it succeeds.
  const trace: TraceSink = {
    write: (runId, steps, { mode, ended }) => {
      if (mode === 'none') return
      if (mode === 'failed' && ended === 'succeeded') return void traces.delete(runId)
      if (steps.length > 0) traces.set(runId, [...(traces.get(runId) ?? []), structuredClone([...steps])])
    },
    read: async (runId) => traces.get(runId)?.flat(),
  }
  const schedule = async (_: null, runId: string, at?: Date) => void queued.push({ runId, ...(at && { at }) })
  const runner = createRunner({ store, queue: { schedule }, tasks, trace, now: () => clock, ...(traceMode && { traceMode }), ...(budgetMs !== undefined && { budgetMs }), ...(secrets && { secrets }), ...(maxSteps !== undefined && { maxSteps }), ...(cache && { cache }) })
  return {
    runner,
    store,
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
    /** Re-runs the failed run `earlier` as `id` on `definition`, with its input, from its checkpoints. */
    rerun: async (id: string, earlier: string, definition: Definition) => {
      const kept = checkpoints.filter((saved) => saved.runId === earlier)
      const problem = rerunProblem(definition.stateMachine, kept)
      if (problem) throw new Error(problem)
      checkpoints.push(...kept.map((saved) => ({ ...rerunCheckpoint(structuredClone(saved), clock), runId: id })))
      runs.set(id, { id, definition, input: runs.get(earlier)!.input, status: 'queued', startedAt: clock })
      await runner.start(null, id)
    },
    /** Replays the run `of` as `id` on `definition` from its start, with its input. */
    replay: async (id: string, of: string, definition: Definition) => {
      runs.set(id, { id, definition, input: runs.get(of)!.input, status: 'queued', startedAt: clock, replayOf: of })
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
