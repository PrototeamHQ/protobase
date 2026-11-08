import type { Machine, State } from '../definition/types'
import { limits } from '../limits'
import type { ScopeOutcome, SegmentContext, StateResult } from './context'
import { StepError, SupersededError } from './errors'
import { jsonBytes } from './json-bytes'
import { advance, checkpointOf, positionOf, startPosition, visitOf } from './position'
import type { StepLog, StepRecord } from './port'
import { runResultState } from './result-states'
import { runChoice, runFail, runPass, runWait } from './simple-states'
import { bindingsOf, innerScope, type StateCall } from './step-input'
import { itemScope } from './replay-match'

const runState = (state: State, call: StateCall): Promise<StateResult> => {
  if (state.Type === 'Pass' || state.Type === 'Succeed') return runPass(state, call)
  if (state.Type === 'Choice') return runChoice(state, call)
  if (state.Type === 'Wait') return runWait(state, call)
  if (state.Type === 'Fail') return runFail(state, call)
  return runResultState(state, call)
}

// A state that fails without retriers and catchers of its own, such as a Choice whose condition does not evaluate.
const ranOrFailed = async (state: State, call: StateCall): Promise<StateResult> => {
  try {
    return await runState(state, call)
  } catch (error) {
    if (!(error instanceof StepError)) throw error
    return { kind: 'step', status: 'failed', next: null, input: call.position.input, error: error.error, cause: error.reason, logs: call.logs }
  }
}

// The step's logs as it keeps them: at most `limits.logLines` lines of at most `limits.logLineLength` characters each,
// each line blanked of secrets before it is cut, and a last line that says how many were left out.
const keptLogs = (logs: StepLog[], redact: (text: string) => string): StepLog[] => {
  const cut = (message: string) => {
    const text = redact(message)
    return text.length > limits.logLineLength ? `${text.slice(0, limits.logLineLength)}…` : text
  }
  const kept = logs.slice(0, limits.logLines).map((line) => ({ ...line, message: cut(line.message) }))
  if (logs.length <= limits.logLines) return kept
  return [...kept, { at: logs.at(-1)!.at, message: `… ${logs.length - limits.logLines} more lines not kept` }]
}

// A step whose input, output or variables are larger than a step may keep fails instead, and so does its run.
const withinLimits = (record: StepRecord): StepRecord => {
  const sized = (['input', 'output', 'assigned'] as const).map((field) => ({ field, bytes: jsonBytes(record[field]) })).find(({ bytes }) => bytes > limits.valueBytes)
  if (!sized) return record
  const { output: _, assigned: __, input: ___, ...rest } = record
  const cause = `The step's ${sized.field} is ${sized.bytes} bytes as JSON, over the ${limits.valueBytes / 1024} KiB a value is kept up to; keep it in a store and pass a reference`
  return { ...rest, status: 'failed', next: null, resumeAt: null, error: 'States.DataLimitExceeded', cause }
}

/**
 * Runs one scope (the run or a Map item) from its latest checkpoint, or from its start at `clock`, until it ends or
 * fails, waits for a time, or the segment's time is up. A recorded Task's step and a step with a time to go on at
 * save the scope's checkpoint before it goes on, with every other scope's kept since the last; any other step only
 * keeps it, as running it again gives the same.
 */
export const runScope = async (context: SegmentContext, machine: Machine, where: { scope: string; logical: string }, input: unknown, outer: Record<string, unknown>, clock: Date): Promise<ScopeOutcome> => {
  const { scope, logical } = where
  const saved = context.saved.get(scope)
  let position = saved ? positionOf(saved) : startPosition(machine, input, clock)
  for (;;) {
    if (position.kind === 'failed') return { kind: 'failed', error: position.error, cause: position.cause }
    if (position.kind === 'ended') {
      // A scope whose last state was a Wait ends only once that time has passed.
      if (position.resumeAt && position.resumeAt > context.now()) return { kind: 'blocked', until: position.resumeAt }
      return { kind: 'ended', output: position.output }
    }
    // Another Map item found the run gone on without this segment: this item stops too, before its next step.
    if (context.superseded()) throw new SupersededError(`Scope "${scope}" stopped: another segment saved a step of this run first`)
    if (position.resumeAt && position.resumeAt > context.now()) return { kind: 'blocked', until: position.resumeAt }
    if (Date.now() >= context.deadline) return { kind: 'yielded' }
    if (context.steps.count >= context.maxSteps) return { kind: 'failed', error: 'States.Runtime', cause: `The run took more than ${context.maxSteps} steps` }
    const name = position.state
    const state = machine.States[name]!
    const startedAt = context.now()
    const from = position
    const visit = visitOf(position)
    const item = (index: number) => ({ scope: innerScope(scope, name, from.seq, index), logical: itemScope(logical, name, visit, index) })
    const runItem = (inner: Machine, index: number, value: unknown, seen: Record<string, unknown>) => runScope(context, inner, item(index), value, seen, from.clock)
    const call: StateCall = { context, name, scope, logical, position, visit, bindings: bindingsOf(context, outer, scope, position), logs: [], runScope: runItem }
    // The step's place under the cap is taken before it runs, so Map items running at once cannot pass the cap together;
    // a state that saves no step gives it back. One that throws ends the segment, whose count goes with it.
    context.steps.count++
    const result = await ranOrFailed(state, call)
    if (result.kind !== 'step') {
      context.steps.count--
      return result
    }
    const { kind: _, logs, recorded = false, fetchedAt, ...step } = result
    const shaped = { ...step, logs: keptLogs(logs, context.redactor.text), scope, seq: position.seq, state: name, type: state.Type, attempt: position.attempt, startedAt, finishedAt: fetchedAt ?? context.now(), recorded }
    // Blanked before it is kept and before the scope goes on from it, so every later state, in this segment or the
    // next, reads the same value.
    const record = withinLimits(context.redactor.value(shaped))
    context.trace(record)
    const before = position
    position = advance(position, record)
    // A scope that failed keeps the checkpoint before, which a run after a crash, or a re-run, goes on from.
    if (position.kind === 'failed') continue
    // A recorded call must not happen twice, and a time to go on at would be set anew by a later run of its step.
    await context.checkpoint(checkpointOf(position, record, before.clock), record.recorded || Boolean(record.resumeAt))
  }
}
