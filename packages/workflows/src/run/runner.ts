import { limits } from '../limits'
import type { StepCacheStore } from './cache/cache-port'
import { blockDefinition } from '../definition/inner'
import type { BlockRunStore, BlockShare, CustomStepJob, CustomStepJobs, KeptAnswer, LoadedRun, RunStore, SegmentQueue, StepRecord, TaskAnswer, TaskHandlers, TaskTokenStore, TraceMode, TraceSink } from './port'
import { blankedMark, secretRedactor } from './redact'
import { runSegment } from './segment'
import { taskTokenHash, tokenPattern } from './task-token'
import { overdue } from './waiting-task'
import { nestingDepth } from '../nesting'

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
  /** Where waiting Tasks' tokens are kept; without it a Task that waits for an outside result fails. */
  tokens?: TaskTokenStore<Db>
  /** Where custom steps wait for a runner; without it a Task of a custom step fails. */
  customSteps?: CustomStepJobs<Db>
  secrets?: Readonly<Record<string, string>>
  trace?: TraceSink
  traceMode?: TraceMode
  now?: () => Date
  budgetMs?: number
  maxSteps?: number
}

const ended = new Set(['succeeded', 'failed'])

/**
 * Why an answer to a waiting Task is refused, by the name Step Functions gives it: a token that is not one
 * (`InvalidToken`), no try with this token (`TaskDoesNotExist`), a try that ended or whose run ended (`TaskTimedOut`),
 * and a result or failure too large to keep (`InvalidOutput`).
 */
export type AnswerRefusal = { error: 'InvalidToken' | 'TaskDoesNotExist' | 'TaskTimedOut' | 'InvalidOutput'; message: string }

// The answer as a try keeps it, a success's output parsed from its JSON; or why it is refused: an output that is no
// JSON or more than a step keeps, an error name or cause over Step Functions' limits.
const keptAnswer = (answer: TaskAnswer): KeptAnswer | AnswerRefusal => {
  const invalid = (message: string): AnswerRefusal => ({ error: 'InvalidOutput', message })
  if (answer.kind === 'success') {
    const bytes = new TextEncoder().encode(answer.output).length
    if (bytes > limits.valueBytes) return invalid(`The output is ${bytes} bytes, over the ${limits.valueBytes / 1024} KiB a step keeps`)
    let output: unknown
    try {
      output = JSON.parse(answer.output)
    } catch {
      return invalid('The output is not JSON: send the result as a string of JSON, as SendTaskSuccess takes it')
    }
    if (nestingDepth(output, limits.inputDepth) > limits.inputDepth) return invalid(`The output nests more than ${limits.inputDepth} levels`)
    return { kind: 'success', output }
  }
  if (answer.kind === 'failure' && answer.error.length > limits.taskErrorLength) return invalid(`The error is ${answer.error.length} characters, more than ${limits.taskErrorLength}`)
  if (answer.kind === 'failure' && answer.cause.length > limits.taskCauseLength) return invalid(`The cause is ${answer.cause.length} characters, more than ${limits.taskCauseLength}`)
  return answer
}

// The definition a run runs: a block's run, its Block's processor, which a version without that Block does not have.
const runDefinition = (run: Pick<LoadedRun, 'definition' | 'blockState'>, definition = run.definition) => (run.blockState ? blockDefinition(definition, run.blockState) : definition)

// Whether a run's output held a secret: each step blanks its own before the run goes on, so the mark is all that tells.
// An output that holds the mark's text itself counts too, which only keeps a block's result from being cached.
const blankedOut = (output: unknown) => (JSON.stringify(output) ?? '').includes(blankedMark)

/**
 * The workflow runner over a port. `start` queues a run's first segment in `db`, which may be the caller's
 * transaction, so the run starts when it commits; `segment` is what the queue's job runs.
 */
export const createRunner = <Db>({ store, queue, tasks, cache, blocks, tokens, customSteps, secrets = {}, trace, traceMode = 'all', now = () => new Date(), budgetMs = limits.segmentMs, maxSteps = limits.runSteps }: RunnerPort<Db>) => {
  // Made once here too, so a secret too short to blank out stops the app at startup.
  secretRedactor(Object.values(secrets))
  // An answer to the try whose token has this hash: its result or failure, which wakes the run, or a heartbeat.
  const answerByHash = async (db: Db, hash: string, answer: TaskAnswer): Promise<{ run: string } | AnswerRefusal> => {
    const kept = keptAnswer(answer)
    // A refusal has no kind; a failure's answer has an error too.
    if (!('kind' in kept)) return kept
    const found = tokens && (await tokens.byHash(db, hash))
    if (!found) return { error: 'TaskDoesNotExist', message: 'No waiting Task was given this token' }
    const closed: AnswerRefusal = { error: 'TaskTimedOut', message: 'The Task this token was given to has ended' }
    if (found.status !== 'waiting') return closed
    const run = await store.load(db, found.run)
    if (!run || ended.has(run.status)) return { error: 'TaskTimedOut', message: 'The run of the Task this token was given to has ended' }
    const at = now()
    const late = overdue(found, at)
    if (late) {
      // The run ends the try at once rather than at its next look.
      await queue.wake(db, found.run)
      return { error: 'TaskTimedOut', message: `The Task this token was given to has ended: ${late.cause}` }
    }
    if (!(await tokens!.answer(db, hash, kept, at))) return closed
    if (answer.kind !== 'heartbeat') await queue.wake(db, found.run)
    return { run: found.run }
  }
  return {
    start: (db: Db, runId: string) => queue.schedule(db, runId),

    /** The steps an ended run's trace holds, which a re-run from one of them starts from: undefined when it kept none. */
    readTrace: async (runId: string) => (await trace?.read(runId)) ?? undefined,

    /**
     * Takes an outside executor's answer to the waiting Task a token was given to: its result or failure, which wakes
     * the run, or a heartbeat. The token is the only proof of who may answer, so it is never kept, only its hash. Gives
     * the run it answered, or why it was refused.
     */
    answerTask: async (db: Db, token: string, answer: TaskAnswer): Promise<{ run: string } | AnswerRefusal> => {
      if (!tokenPattern.test(token)) return { error: 'InvalidToken', message: 'This is not a task token' }
      return answerByHash(db, await taskTokenHash(token), answer)
    },

    /**
     * Takes an answer as `answerTask` does, to the try whose token has this hash, from the app's own executor, which
     * proves otherwise that it may answer and never holds the token: a custom step's runner.
     */
    answerTaskByHash: (db: Db, hash: string, answer: TaskAnswer) => answerByHash(db, hash, answer),

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
      const taskTokens = tokens && { find: (visit: string) => tokens.find(db, runId, visit), begin: (task: Omit<Parameters<TaskTokenStore<Db>['begin']>[1], 'run'>) => tokens.begin(db, { ...task, run: runId }), handedOff: (visit: string, done: Parameters<TaskTokenStore<Db>['handedOff']>[3]) => tokens.handedOff(db, runId, visit, done), close: (visit: string, failure: { error: string; cause: string }, seen?: { heartbeatAt: Date | null }) => tokens.close(db, runId, visit, failure, seen) }
      const jobs = customSteps && { queue: (job: Omit<CustomStepJob, 'run'>) => customSteps.queue(db, { ...job, run: runId }) }
      const segment = { runId, definition, input: run.input, startedAt: run.startedAt, secrets, redactor, tasks, ...(cache && { cache }), ...(blockRuns && { blocks: blockRuns }), ...(taskTokens && { tokens: taskTokens }), ...(jobs && { customSteps: jobs }), signal, now, budgetMs, maxSteps }
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
