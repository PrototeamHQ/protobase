import type { MapState, TaskState } from '../definition/types'
import { limits } from '../limits'
import type { StateResult } from './context'
import { errorOutput, StepError } from './errors'
import { evaluateAssign, evaluateTemplate } from './evaluate'
import { fanOut } from './fan-out'
import { redacted } from './redact'
import { recover } from './recovery'
import { innerScope, visibleVariables, type StateCall } from './step-input'
import { runTask } from './task'

type Ran = { result: unknown; input: unknown } | { failure: { Error: string; Cause: string }; input: unknown } | Extract<StateResult, { kind: 'blocked' | 'yielded' }>

const task = async (state: TaskState, call: StateCall): Promise<Ran> => {
  const args = await evaluateTemplate(state.Arguments ?? {}, call.bindings, 'Arguments')
  const key = `${call.context.runId}/${call.scope}/${call.position.seq}`
  const input = redacted(args)
  return runTask(call.context, state, args, key, call.logs).then(
    (result) => ({ result, input }),
    (error: unknown) => {
      if (!(error instanceof StepError)) throw error
      return { failure: errorOutput(error), input }
    },
  )
}

const map = async (state: MapState, call: StateCall): Promise<Ran> => {
  const items = await evaluateTemplate(state.Items, call.bindings, 'Items')
  if (!Array.isArray(items)) throw new StepError('States.QueryEvaluationError', `Items: gave ${JSON.stringify(items) ?? 'nothing'}, not an array`)
  if (items.length > limits.mapItems) throw new StepError('States.DataLimitExceeded', `Items: ${items.length} items, more than the ${limits.mapItems} a Map takes`)
  const outer = visibleVariables(call.bindings)
  const scopes = items.map((item, index) => () => call.runScope(state.ItemProcessor, innerScope(call.scope, call.name, call.position.seq, index), item, outer))
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
 * its own or an item's, goes to its retriers and catchers.
 */
export const runResultState = async (state: TaskState | MapState, call: StateCall): Promise<StateResult> => {
  const ran = await attempt(state, call)
  if ('kind' in ran) return ran
  const now = call.context.now()
  if ('failure' in ran) return { ...(await recover(state, call.position, ran.failure, call.bindings, now, call.logs)), ...(ran.input !== undefined && { input: ran.input }) } as StateResult
  const after = { ...call.bindings, states: { ...(call.bindings.states as object), result: ran.result } }
  const shaped = async () => ({
    output: state.Output === undefined ? ran.result : await evaluateTemplate(state.Output, after, 'Output'),
    assigned: await evaluateAssign(state.Assign, after),
  })
  const done = await shaped().catch((error: unknown) => {
    if (!(error instanceof StepError)) throw error
    return { failure: errorOutput(error) }
  })
  if ('failure' in done) return { ...(await recover(state, call.position, done.failure, call.bindings, now, call.logs)), input: ran.input } as StateResult
  return { kind: 'step', status: 'succeeded', next: state.Next ?? null, input: ran.input, ...done, logs: call.logs }
}
