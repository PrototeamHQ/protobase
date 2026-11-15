import type { TaskState } from '../definition/types'
import { taskResource } from '../definition/task-resource'
import { limits } from '../limits'
import { errorOutput, StepError } from './errors'
import { evaluateTemplate, recordedArguments, type Bindings } from './evaluate'
import type { WaitingTask } from './port'
import type { Ran } from './ran'
import { redacted } from './redact'
import type { StateCall } from './step-input'
import { runTask } from './task'
import { newTaskToken, taskTokenHash } from './task-token'

// The bindings of a waiting Task's Arguments, which read its try's token as `$states.context.Task.Token`.
const withToken = (bindings: Bindings, token: string): Bindings => {
  const states = bindings.states as { context: object }
  return { ...bindings, states: { ...states, context: { ...states.context, Task: { Token: token } } } }
}

/** When a try's next heartbeat is due: from its last one, else from its hand-off; none without `HeartbeatSeconds`. */
export const heartbeatDue = (task: WaitingTask) => {
  if (task.heartbeatSeconds === null) return
  const from = task.heartbeatAt ?? task.handedOffAt ?? task.startedAt
  return new Date(from.getTime() + task.heartbeatSeconds * 1000)
}

/** Why a waiting try can take no answer now: its time ran out, or a heartbeat is overdue. */
export const overdue = (task: WaitingTask, at: Date, timeoutSeconds = Math.round((task.deadline.getTime() - task.startedAt.getTime()) / 1000)) => {
  if (at >= task.deadline) return { error: 'States.Timeout', cause: `No outside result came within ${timeoutSeconds} seconds` }
  const due = heartbeatDue(task)
  if (due && at >= due) return { error: 'States.HeartbeatTimeout', cause: `No heartbeat came within ${task.heartbeatSeconds} seconds` }
}

/**
 * One try of a Task that waits for an outside result (`<type>.waitForTaskToken`). The first segment to reach it gives
 * the try a token, runs the step type on Arguments that read it as `$states.context.Task.Token`, and marks the token
 * handed off, so a segment after a restart only waits and never hands the work off again. The run then waits, holding
 * no segment, until an answer wakes it, its `TimeoutSeconds` pass (`States.Timeout`, from the try's start) or a
 * heartbeat is overdue (`States.HeartbeatTimeout`). The answer is the Task's result, which `Output` and `Assign` read as
 * `$states.result`, or its failure, under the error the answer names. The token is blanked out of all the run keeps.
 */
export const runWaitingTask = async (state: TaskState, call: StateCall): Promise<Ran> => {
  const { type } = taskResource(state.Resource)
  const template = state.Arguments ?? {}
  // A replay sends nothing: it goes on with what the replayed run's step gave.
  if (call.context.replay) return { held: true, input: redacted(recordedArguments(template, await evaluateTemplate(template, withToken(call.bindings, ''), 'Arguments'))) }
  const tokens = call.context.tokens
  if (!tokens) throw new StepError('States.Runtime', 'This app keeps no waiting Tasks')
  const visit = `${call.scope}|${call.position.seq}`
  const found = await tokens.find(visit)
  if (found && (found.handedOffAt || found.status !== 'waiting')) return settle(found, visit, call)

  const token = newTaskToken()
  call.context.redactor.add(token)
  const startedAt = call.context.now()
  const timeout = state.TimeoutSeconds ?? limits.waitingTaskTimeoutSeconds
  const hash = await taskTokenHash(token)
  await tokens.begin({ visit, state: call.name, hash, startedAt, deadline: new Date(startedAt.getTime() + timeout * 1000), heartbeatSeconds: state.HeartbeatSeconds ?? null })
  const args = await evaluateTemplate(template, withToken(call.bindings, token), 'Arguments')
  const input = call.context.redactor.value(redacted(recordedArguments(template, args)))
  // Each token hands off under a key of its own, from its hash, so a receiver that drops a repeated key never drops the
  // only token that can still answer: a retry's, or one given again after a restart before its hand-off was marked.
  // The hand-off runs as long as a step type may, and caches nothing.
  const key = `${call.context.runId}/${call.scope}/${call.position.seq}/${hash.slice(0, 16)}`
  const handOff = { ...state, Resource: type, TimeoutSeconds: Math.min(timeout, limits.taskTimeoutSeconds), Cache: false }
  try {
    await runTask(call.context, handOff, args, key, call.logs)
  } catch (error) {
    if (!(error instanceof StepError)) throw error
    const failure = errorOutput(error)
    if (await tokens.close(visit, { error: failure.Error, cause: failure.Cause })) return { failure, input, recorded: true }
    // The receiver answered before its hand-off failed, so that answer is the try's
    return handedOff(visit, call, input)
  }
  call.logs.push({ at: call.context.now().toISOString(), message: `Handed off; waits for an outside result until ${new Date(startedAt.getTime() + timeout * 1000).toISOString()}` })
  return handedOff(visit, call, input)
}

// Marks a try handed off, with its input and its logs so far, and settles it as it stands.
const handedOff = async (visit: string, call: StateCall, input: unknown): Promise<Ran> => {
  const tokens = call.context.tokens!
  await tokens.handedOff(visit, { at: call.context.now(), input, logs: call.logs.map((line) => ({ ...line, message: call.context.redactor.text(line.message) })) })
  return settle((await tokens.find(visit))!, visit, call)
}

// A try handed off: its answer, or its end once its time ran out, else a wait until the earlier of its deadline and
// its next heartbeat. The step keeps the hand-off's logs, whichever segment ends it.
const settle = async (task: WaitingTask, visit: string, call: StateCall): Promise<Ran> => {
  call.logs.splice(0, call.logs.length, ...task.logs)
  const input = task.input
  if (task.status === 'succeeded') {
    call.logs.push({ at: call.context.now().toISOString(), message: `The outside result came at ${task.answeredAt?.toISOString()}` })
    return { result: task.output ?? null, input, recorded: true, ...(task.answeredAt && { fetchedAt: task.answeredAt }) }
  }
  if (task.status === 'failed') return { failure: { Error: task.error ?? 'States.TaskFailed', Cause: task.cause ?? '' }, input, recorded: true }
  const late = overdue(task, call.context.now())
  if (late) {
    // An answer that came meanwhile settled the try first, and is taken instead; a heartbeat that came meanwhile renewed
    // it, so it waits on.
    if (!(await call.context.tokens!.close(visit, late, { heartbeatAt: task.heartbeatAt }))) return settle((await call.context.tokens!.find(visit))!, visit, call)
    return { failure: { Error: late.error, Cause: late.cause }, input, recorded: true }
  }
  const due = heartbeatDue(task)
  return { kind: 'blocked', until: due && due < task.deadline ? due : task.deadline }
}
