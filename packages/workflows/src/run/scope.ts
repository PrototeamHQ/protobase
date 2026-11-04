import type { Machine, State } from '../definition/types'
import { limits } from '../limits'
import type { ScopeOutcome, SegmentContext, StateResult } from './context'
import { StepError } from './errors'
import { advance, foldPosition } from './position'
import type { StepLog, StepRecord } from './port'
import { runResultState } from './result-states'
import { runChoice, runFail, runPass, runWait } from './simple-states'
import { bindingsOf, type StateCall } from './step-input'

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

const jsonBytes = (value: unknown) => (value === undefined ? 0 : new TextEncoder().encode(JSON.stringify(value)).length)

// A step whose input, output or variables are larger than a step may save fails instead, and so does its run.
const withinLimits = (record: StepRecord): StepRecord => {
  const field = (['input', 'output', 'assigned'] as const).find((name) => jsonBytes(record[name]) > limits.valueBytes)
  if (!field) return record
  const { output: _, assigned: __, input: ___, ...rest } = record
  return { ...rest, status: 'failed', next: null, resumeAt: null, error: 'States.DataLimitExceeded', cause: `The step's ${field} is larger than ${limits.valueBytes / 1024 / 1024} MiB` }
}

/**
 * Runs one scope (the run or a Map item) from where its saved steps leave it, saving each step as
 * it ends, until the scope ends or fails, waits for a time, or the segment's time is up.
 */
export const runScope = async (context: SegmentContext, machine: Machine, scope: string, input: unknown, outer: Record<string, unknown>): Promise<ScopeOutcome> => {
  let position = foldPosition(machine, input, context.saved.get(scope) ?? [])
  for (;;) {
    if (position.kind === 'ended') return { kind: 'ended', output: position.output }
    if (position.kind === 'failed') return { kind: 'failed', error: position.error, cause: position.cause }
    if (position.resumeAt && position.resumeAt > context.now()) return { kind: 'blocked', until: position.resumeAt }
    if (Date.now() >= context.deadline) return { kind: 'yielded' }
    if (context.steps.count >= context.maxSteps) return { kind: 'failed', error: 'States.Runtime', cause: `The run took more than ${context.maxSteps} steps` }
    const name = position.state
    const state = machine.States[name]!
    const startedAt = context.now()
    const call: StateCall = { context, name, scope, position, bindings: bindingsOf(context, outer, position), logs: [], runScope: (inner, key, value, seen) => runScope(context, inner, key, value, seen) }
    const result = await ranOrFailed(state, call)
    if (result.kind !== 'step') return result
    const { kind: _, logs, ...step } = result
    const shaped = { ...step, logs: keptLogs(logs, context.redactor.text), scope, seq: position.seq, state: name, type: state.Type, attempt: position.attempt, startedAt, finishedAt: context.now() }
    // Blanked before it is saved and before the scope goes on from it, so every later state, in this segment or the
    // next, reads the same value.
    const record = withinLimits(context.redactor.value(shaped))
    await context.save(record)
    context.steps.count++
    position = advance(position, record)
  }
}
