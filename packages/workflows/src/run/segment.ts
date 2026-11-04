import type { Definition } from '../definition/types'
import { limits } from '../limits'
import type { ScopeOutcome } from './context'
import { SupersededError } from './errors'
import type { SavedStep, StepRecord, TaskHandlers } from './port'
import { runScope } from './scope'

export type SegmentInput = {
  runId: string
  definition: Definition
  input: unknown
  /** The steps the run saved so far. */
  saved: readonly SavedStep[]
  /** Saves a step in one guarded statement: false when its scope and seq are taken. */
  save: (step: StepRecord) => Promise<boolean>
  tasks: TaskHandlers
  signal: AbortSignal
  now?: () => Date
  /** How long the segment takes new steps. Default `limits.segmentMs`. */
  budgetMs?: number
}

/**
 * Runs a run's steps from where its saved steps leave it to its next wait: it ends or fails, waits until a time
 * (a Wait, a retry's delay), or yields once its time is up. `superseded` when another segment saved a step first.
 */
export const runSegment = async ({ runId, definition, input, saved, save, tasks, signal, now = () => new Date(), budgetMs = limits.segmentMs }: SegmentInput): Promise<ScopeOutcome | { kind: 'superseded' }> => {
  const byScope = new Map<string, SavedStep[]>()
  for (const step of [...saved].sort((a, b) => a.seq - b.seq)) {
    const steps = byScope.get(step.scope)
    if (steps) steps.push(step)
    else byScope.set(step.scope, [step])
  }
  const context = {
    runId,
    trigger: input,
    tasks,
    signal,
    now,
    deadline: Date.now() + budgetMs,
    saved: byScope,
    save: async (step: StepRecord) => {
      if (!(await save(step))) throw new SupersededError(`Step ${step.seq} of scope "${step.scope}" was saved by another segment`)
    },
    steps: { count: saved.length },
  }
  try {
    return await runScope(context, definition, '', input, {})
  } catch (error) {
    if (!(error instanceof SupersededError)) throw error
    return { kind: 'superseded' }
  }
}
