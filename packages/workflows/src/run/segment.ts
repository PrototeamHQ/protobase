import type { Definition } from '../definition/types'
import { limits } from '../limits'
import type { ScopeOutcome } from './context'
import { SupersededError } from './errors'
import type { SavedStep, StepRecord, TaskHandlers } from './port'
import type { Redactor } from './redact'
import { runScope } from './scope'

export type SegmentInput = {
  runId: string
  definition: Definition
  input: unknown
  /** When the run started, which expressions read as `$states.context.Execution.StartTime`. */
  startedAt: Date
  /** The secrets expressions may read as `$states.context.Secrets.<NAME>`, by name. */
  secrets: Readonly<Record<string, string>>
  /** Blanks the secrets out of what the run records. */
  redactor: Redactor
  /** The steps the run saved so far. */
  saved: readonly SavedStep[]
  /** Saves steps in one guarded statement: false when any of their scopes and seqs is taken. */
  save: (steps: readonly StepRecord[]) => Promise<boolean>
  tasks: TaskHandlers
  signal: AbortSignal
  now?: () => Date
  /** How long the segment takes new steps. Default `limits.segmentMs`. */
  budgetMs?: number
  /** The most steps the run takes. Default `limits.runSteps`. */
  maxSteps?: number
}

/**
 * Runs a run's steps from where its saved steps leave it to its next wait: it ends or fails, waits until a time
 * (a Wait, a retry's delay), or yields once its time is up. `superseded` when another segment saved a step first.
 */
export const runSegment = async ({ runId, definition, input, startedAt, secrets, redactor, saved, save, tasks, signal, now = () => new Date(), budgetMs = limits.segmentMs, maxSteps = limits.runSteps }: SegmentInput): Promise<ScopeOutcome | { kind: 'superseded' }> => {
  const byScope = new Map<string, SavedStep[]>()
  for (const step of [...saved].sort((a, b) => a.seq - b.seq)) {
    const steps = byScope.get(step.scope)
    if (steps) steps.push(step)
    else byScope.set(step.scope, [step])
  }
  let superseded = false
  // Steps kept until the next checkpoint saves them: the next segment runs again those of a segment that died first.
  let kept: StepRecord[] = []
  const write = async () => {
    const steps = kept
    kept = []
    if (steps.length === 0 || (await save(steps))) return
    superseded = true
    throw new SupersededError(`Step ${steps[0]!.seq} of scope "${steps[0]!.scope}" was saved by another segment`)
  }
  const context = {
    runId,
    stateContext: { Execution: { Input: input, StartTime: startedAt.toISOString() }, Secrets: secrets },
    redactor,
    tasks,
    signal,
    now,
    deadline: Date.now() + budgetMs,
    saved: byScope,
    save: async (step: StepRecord, checkpoint: boolean) => {
      kept.push(step)
      if (checkpoint) await write()
    },
    superseded: () => superseded,
    steps: { count: saved.length },
    maxSteps,
  }
  try {
    const outcome = await runScope(context, definition.stateMachine, '', input, {})
    await write()
    return outcome
  } catch (error) {
    if (!(error instanceof SupersededError)) throw error
    return { kind: 'superseded' }
  }
}
