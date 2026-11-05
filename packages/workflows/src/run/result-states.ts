import type { MapState, TaskState } from '../definition/types'
import { limits } from '../limits'
import type { ScopeOutcome, StateResult } from './context'
import { errorOutput, StepError } from './errors'
import { evaluateAssign, evaluateKept, evaluateTemplate, recordedArguments } from './evaluate'
import { fanOut } from './fan-out'
import { jsonBytes } from './json-bytes'
import { redacted } from './redact'
import { recover } from './recovery'
import { stepFunctions } from './step-functions'
import { innerScope, visibleVariables, type StateCall } from './step-input'
import { runTask } from './task'

type Ran =
  | { result: unknown; input: unknown; recorded?: boolean }
  | { failure: { Error: string; Cause: string }; input: unknown; recorded?: boolean }
  | Extract<StateResult, { kind: 'blocked' | 'yielded' }>

// Whether a call is recorded: every call that changes the world, and a read marked not to be done again, by the Task
// or else by its step type.
const isRecorded = (state: TaskState, call: StateCall, args: unknown) => {
  const handler = call.context.tasks[state.Resource]
  if (!handler) return false
  return !(handler.reads?.(args) ?? false) || (state.DoNotRepeat ?? handler.doNotRepeat ?? false)
}

const task = async (state: TaskState, call: StateCall): Promise<Ran> => {
  const args = await evaluateTemplate(state.Arguments ?? {}, call.bindings, 'Arguments')
  // Each try of a visit is a step of its own, so the key counts from the visit's first try: the same for every retry.
  const key = `${call.context.runId}/${call.scope}/${call.position.seq - call.position.attempt + 1}`
  const input = redacted(recordedArguments(state.Arguments ?? {}, args))
  const recorded = isRecorded(state, call, args)
  return runTask(call.context, state, args, key, call.logs).then(
    (result) => ({ result, input, recorded }),
    (error: unknown) => {
      if (!(error instanceof StepError)) throw error
      return { failure: errorOutput(error), input, recorded }
    },
  )
}

const map = async (state: MapState, call: StateCall): Promise<Ran> => {
  const items = await evaluateKept(state.Items, call.bindings, 'Items')
  if (!Array.isArray(items)) throw new StepError('States.QueryEvaluationError', `Items: gave ${JSON.stringify(items) ?? 'nothing'}, not an array`)
  if (items.length > limits.mapItems) throw new StepError('States.DataLimitExceeded', `Items: ${items.length} items, more than the ${limits.mapItems} a Map takes`)
  const outer = visibleVariables(call.bindings)
  // The items' outputs make the Map's, which a step saves only up to `limits.valueBytes`: counted as each item ends, so
  // the Map fails once they pass it rather than after holding every one.
  let kept = 0
  const scopes = items.map((item, index) => async (): Promise<ScopeOutcome> => {
    const outcome = await call.runScope(state.ItemProcessor, innerScope(call.scope, call.name, call.position.seq, index), item, outer)
    if (outcome.kind !== 'ended') return outcome
    kept += jsonBytes(outcome.output)
    if (kept <= limits.valueBytes) return outcome
    return { kind: 'failed', error: 'States.DataLimitExceeded', cause: `The items' outputs are larger than ${limits.valueBytes / 1024 / 1024} MiB together` }
  })
  const outcome = await fanOut(scopes, state.MaxConcurrency || limits.mapConcurrency)
  if (outcome.kind === 'blocked' || outcome.kind === 'yielded') return outcome
  const input = { items: items.length }
  if (outcome.kind === 'failed') return { failure: { Error: outcome.error, Cause: outcome.cause }, input }
  call.logs.push({ at: call.context.now().toISOString(), message: `${items.length} items` })
  return { result: outcome.outputs, input }
}


// Runs the state, a failure of its own as the error it names.
const attempt = async (state: TaskState | MapState, call: StateCall): Promise<Ran> => {
  try {
    if (state.Type === 'Task') return await task(state, call)
    return await map(state, call)
  } catch (error) {
    if (!(error instanceof StepError)) throw error
    return { failure: errorOutput(error), input: undefined }
  }
}

/**
 * A Task or a Map: its result shaped by `Output` and `Assign`, which read it as `$states.result`; a failure,
 * its own or an item's, goes to its retriers and catchers. In a recorded Task's `Output` and `Assign`, `$now` is when
 * its result was fetched, which the checkpoint keeps as the scope's clock.
 */
export const runResultState = async (state: TaskState | MapState, call: StateCall): Promise<StateResult> => {
  const ran = await attempt(state, call)
  if ('kind' in ran) return ran
  const now = call.context.now()
  const recorded = { ...(ran.recorded && { recorded: true, fetchedAt: now }) }
  if ('failure' in ran) return { ...(await recover(state, call.position, ran.failure, call.bindings, now, call.logs)), ...(ran.input !== undefined && { input: ran.input }), ...recorded } as StateResult
  const { now: fetched, millis } = stepFunctions(ran.recorded ? now : call.position.clock, '')
  const after = { ...call.bindings, now: fetched, millis, states: { ...(call.bindings.states as object), result: ran.result } }
  const shaped = async () => ({
    output: state.Output === undefined ? ran.result : await evaluateKept(state.Output, after, 'Output'),
    assigned: await evaluateAssign(state.Assign, after),
  })
  const done = await shaped().catch((error: unknown) => {
    if (!(error instanceof StepError)) throw error
    return { failure: errorOutput(error) }
  })
  if ('failure' in done) return { ...(await recover(state, call.position, done.failure, call.bindings, now, call.logs)), input: ran.input, ...recorded } as StateResult
  return { kind: 'step', status: 'succeeded', next: state.Next ?? null, input: ran.input, ...done, logs: call.logs, ...recorded }
}
