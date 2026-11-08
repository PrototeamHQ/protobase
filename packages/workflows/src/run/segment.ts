import type { Definition } from '../definition/types'
import { limits } from '../limits'
import type { ScopeOutcome } from './context'
import { SupersededError } from './errors'
import type { Checkpoint, StepRecord, TaskHandlers } from './port'
import type { Redactor } from './redact'
import type { StepCacheStore } from './cache/cache-port'
import { secretNamer } from './cache/secret-names'
import { replayOf, type Replayed } from './replay-of'
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
  /** The latest checkpoint of each scope the run saved so far. */
  saved: readonly Checkpoint[]
  /** Saves checkpoints in one guarded statement: false when a scope has one newer than the one it follows. */
  save: (checkpoints: readonly Checkpoint[]) => Promise<boolean>
  /** Hands the steps run since the last time to the trace, before a checkpoint after them is saved. */
  keep: (steps: readonly StepRecord[]) => Promise<void>
  tasks: TaskHandlers
  /** Where step types that cache keep their results; none keeps nothing. */
  cache?: StepCacheStore
  /** In a replay, the run it replays, with its steps from its trace. */
  replayed?: Replayed
  signal: AbortSignal
  now?: () => Date
  /** How long the segment takes new steps. Default `limits.segmentMs`. */
  budgetMs?: number
  /** The most steps the run takes. Default `limits.runSteps`. */
  maxSteps?: number
}

/** How a segment ended, with the steps it ran since it last handed them to `keep`, for the run's trace. */
export type SegmentOutcome = (ScopeOutcome | { kind: 'superseded' }) & { steps: StepRecord[] }

/**
 * Runs a run's steps from where its checkpoints leave it to its next wait: it ends or fails, waits until a time
 * (a Wait, a retry's delay), or yields once its time is up, saving its checkpoints on the way and as it pauses.
 * `superseded` when another segment saved a newer checkpoint first.
 */
export const runSegment = async ({ runId, definition, input, startedAt, secrets, redactor, saved, save, keep, tasks, cache, replayed, signal, now = () => new Date(), budgetMs = limits.segmentMs, maxSteps = limits.runSteps }: SegmentInput): Promise<SegmentOutcome> => {
  const latest = new Map(saved.map((checkpoint) => [checkpoint.scope, checkpoint]))
  // The seq of each scope's last saved checkpoint, which the next one follows.
  const after = new Map(saved.map((checkpoint) => [checkpoint.scope, checkpoint.seq]))
  const steps: StepRecord[] = []
  let superseded = false
  // Where each scope stands since its last save: the next segment runs again the steps of one that died first.
  let kept = new Map<string, Omit<Checkpoint, 'after'>>()
  // A Map's items save at once, so their steps go to `keep` one hand-over at a time, in the order they were taken, and
  // the trace numbers each part after the one before.
  let keeping: Promise<unknown> = Promise.resolve()
  const write = async () => {
    const checkpoints = [...kept.values()].map((checkpoint) => ({ ...checkpoint, after: after.get(checkpoint.scope) ?? -1 }))
    kept = new Map()
    if (checkpoints.length === 0) return
    // Kept before the checkpoint after them, so a crash once it is saved, which no later segment runs again, loses none.
    const ran = steps.splice(0)
    if (ran.length > 0) {
      const handed = keeping.then(() => keep(ran))
      // The next hand-over waits for this one whether it kept or failed: this write gets its outcome.
      keeping = handed.catch(() => {})
      await handed
    }
    if (await save(checkpoints)) {
      for (const checkpoint of checkpoints) after.set(checkpoint.scope, checkpoint.seq)
      return
    }
    superseded = true
    throw new SupersededError(`A checkpoint of scope "${checkpoints[0]!.scope}" was saved by another segment`)
  }
  const context = {
    runId,
    stateContext: { Execution: { Input: input, StartTime: startedAt.toISOString() }, Secrets: secrets },
    redactor,
    tasks,
    ...(cache && { cache: { store: cache, nameSecrets: secretNamer(secrets) } }),
    ...(replayed && { replay: replayOf(replayed) }),
    signal,
    now,
    deadline: Date.now() + budgetMs,
    saved: latest,
    checkpoint: async (checkpoint: Omit<Checkpoint, 'after'>, save: boolean) => {
      kept.set(checkpoint.scope, checkpoint)
      if (save) await write()
    },
    trace: (step: StepRecord) => void steps.push(step),
    superseded: () => superseded,
    // Each scope numbers its steps from 0, so its latest checkpoint counts the steps it took up to it.
    steps: { count: saved.reduce((count, checkpoint) => count + checkpoint.seq + 1, 0) },
    maxSteps,
  }
  try {
    const outcome = await runScope(context, definition.stateMachine, { scope: '', logical: '' }, input, {}, startedAt)
    // A run that ended needs no checkpoint: its outcome is the run's own.
    if (outcome.kind === 'blocked' || outcome.kind === 'yielded') await write()
    return { ...outcome, steps }
  } catch (error) {
    if (!(error instanceof SupersededError)) throw error
    return { kind: 'superseded', steps }
  }
}
