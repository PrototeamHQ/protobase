import type { Definition } from '../definition/types'
import { createRunner } from './runner'
import type { LoadedRun, RunStore, StepRecord, TaskHandlers } from './port'

/**
 * The runner over a port kept in memory, with a clock tests move: for the package's unit tests. `drain` runs a run's
 * segments as the queue would, moving the clock to each wait's end, until nothing is queued.
 */
export const memoryRunner = (tasks: TaskHandlers, { budgetMs, secrets, maxSteps }: { budgetMs?: number; secrets?: Record<string, string>; maxSteps?: number } = {}) => {
  let clock = new Date('2026-11-04T12:00:00Z')
  const runs = new Map<string, LoadedRun & Record<string, unknown>>()
  const steps: (StepRecord & { runId: string })[] = []
  const queued: { runId: string; at?: Date }[] = []
  const store: RunStore<null> = {
    load: async (_, id) => runs.get(id),
    steps: async (_, runId) => steps.filter((saved) => saved.runId === runId),
    save: async (_, runId, step) => {
      if (steps.some((saved) => saved.runId === runId && saved.scope === step.scope && saved.seq === step.seq)) return false
      steps.push({ ...structuredClone(step), runId })
      return true
    },
    update: async (_, id, change) => {
      const run = runs.get(id)!
      if (run.status === 'succeeded' || run.status === 'failed') return
      runs.set(id, { ...run, ...change })
    },
  }
  const runner = createRunner({ store, queue: { schedule: async (_, runId, at) => void queued.push({ runId, ...(at && { at }) }) }, tasks, now: () => clock, ...(budgetMs !== undefined && { budgetMs }), ...(secrets && { secrets }), ...(maxSteps !== undefined && { maxSteps }) })
  return {
    runner,
    steps,
    run: (id: string) => runs.get(id)!,
    now: () => clock,
    start: async (id: string, definition: Definition, input: unknown) => {
      runs.set(id, { id, definition, input, status: 'queued', startedAt: clock })
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
    drain: async function () {
      for (let segments = 0; await this.step(); segments++) if (segments > 1000) throw new Error('The run did not settle')
    },
  }
}
