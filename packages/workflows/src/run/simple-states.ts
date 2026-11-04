import type { ChoiceState, FailState, PassState, SucceedState, WaitState } from '../definition/types'
import { limits } from '../limits'
import type { StateResult } from './context'
import { evaluateAssign, evaluateKept, evaluateTemplate } from './evaluate'
import { StepError } from './errors'
import type { StateCall } from './step-input'

const nextOf = (state: { Next?: string }) => state.Next ?? null

// The state's own output: its Output, else what it was given.
const outputOf = async (state: { Output?: unknown }, call: StateCall) => (state.Output === undefined ? call.position.input : evaluateKept(state.Output, call.bindings, 'Output'))

export const runPass = async (state: PassState | SucceedState, call: StateCall): Promise<StateResult> => ({
  kind: 'step',
  status: 'succeeded',
  next: state.Type === 'Pass' ? nextOf(state) : null,
  input: call.position.input,
  output: await outputOf(state, call),
  assigned: await evaluateAssign('Assign' in state ? state.Assign : undefined, call.bindings),
  logs: call.logs,
})

export const runChoice = async (state: ChoiceState, call: StateCall): Promise<StateResult> => {
  for (const [index, rule] of state.Choices.entries()) {
    const field = `Choices[${index}].Condition`
    const holds = await evaluateTemplate(rule.Condition, call.bindings, field)
    if (typeof holds !== 'boolean') throw new StepError('States.QueryEvaluationError', `${field}: gave ${JSON.stringify(holds) ?? 'nothing'}, not true or false`)
    if (!holds) continue
    call.logs.push({ at: call.context.now().toISOString(), message: `Choice ${index + 1} holds` })
    const shaped = { Output: rule.Output === undefined ? state.Output : rule.Output, Assign: rule.Assign ?? state.Assign }
    return { kind: 'step', status: 'succeeded', next: rule.Next, input: call.position.input, output: await outputOf(shaped, call), assigned: await evaluateAssign(shaped.Assign, call.bindings), logs: call.logs }
  }
  if (state.Default === undefined) throw new StepError('States.NoChoiceMatched', 'No choice holds and the state has no Default')
  call.logs.push({ at: call.context.now().toISOString(), message: 'No choice holds: Default' })
  return { kind: 'step', status: 'succeeded', next: state.Default, input: call.position.input, output: await outputOf(state, call), assigned: await evaluateAssign(state.Assign, call.bindings), logs: call.logs }
}

// An ISO 8601 date and time with its offset, such as 2026-11-04T12:00:00Z, read only when its date is on the calendar:
// `new Date` alone takes other formats and moves 2026-02-30 to March 2.
const isoPattern = /^(\d{4})-(\d{2})-(\d{2})T([01]\d|2[0-3]):[0-5]\d(:[0-5]\d(\.\d+)?)?(Z|[+-]([01]\d|2[0-3]):[0-5]\d)$/
const isoTime = (text: string) => {
  const match = isoPattern.exec(text)
  if (!match) return undefined
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])]
  const date = new Date(Date.UTC(year, month - 1, day))
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return undefined
  return new Date(text)
}

const waitUntil = async (state: WaitState, call: StateCall) => {
  const now = call.context.now()
  if (state.Seconds !== undefined) {
    const seconds = await evaluateTemplate(state.Seconds, call.bindings, 'Seconds')
    if (typeof seconds !== 'number' || !(seconds >= 0) || seconds > limits.waitSeconds) throw new StepError('States.QueryEvaluationError', `Seconds: gave ${JSON.stringify(seconds) ?? 'nothing'}, not a number of seconds from 0 to ${limits.waitSeconds}`)
    return new Date(now.getTime() + seconds * 1000)
  }
  const timestamp = await evaluateTemplate(state.Timestamp, call.bindings, 'Timestamp')
  const at = typeof timestamp === 'string' ? isoTime(timestamp) : undefined
  if (!at) throw new StepError('States.QueryEvaluationError', `Timestamp: gave ${JSON.stringify(timestamp) ?? 'nothing'}, not an ISO 8601 time such as 2026-11-04T12:00:00Z`)
  if (at.getTime() - now.getTime() > limits.waitSeconds * 1000) throw new StepError('States.QueryEvaluationError', `Timestamp: gave ${JSON.stringify(timestamp)}, more than ${limits.waitSeconds} seconds from now`)
  return at
}

/** A Wait saves its step at once, with the time the next state may run: the segment ends there, and the queue wakes the run. */
export const runWait = async (state: WaitState, call: StateCall): Promise<StateResult> => {
  const resumeAt = await waitUntil(state, call)
  return { kind: 'step', status: 'succeeded', next: nextOf(state), input: call.position.input, output: await outputOf(state, call), assigned: await evaluateAssign(state.Assign, call.bindings), resumeAt, logs: call.logs }
}

export const runFail = async (state: FailState, call: StateCall): Promise<StateResult> => {
  const text = async (value: string | undefined, field: string) => (value === undefined ? undefined : String(await evaluateKept(value, call.bindings, field)))
  return { kind: 'step', status: 'failed', next: null, input: call.position.input, error: (await text(state.Error, 'Error')) ?? 'States.Fail', cause: (await text(state.Cause, 'Cause')) ?? '', logs: call.logs }
}
