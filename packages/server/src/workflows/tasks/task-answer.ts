import type { AnswerRefusal, TaskAnswer } from '@protobase/workflows'

/** The three calls an outside executor answers a waiting Task with, as Step Functions names them. */
export const answerCalls = { success: 'SendTaskSuccess', failure: 'SendTaskFailure', heartbeat: 'SendTaskHeartbeat' } as const
export type AnswerCall = keyof typeof answerCalls

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)

/**
 * A call's token and answer from its body, exactly as Step Functions' calls take them: `taskToken`, and `output`, a
 * string of JSON, or `error` and `cause`; or why the body is not one. Whether `output` is JSON is the engine's to say.
 */
export const answerOf = (call: AnswerCall, body: unknown): { token: string; answer: TaskAnswer } | { problem: string } => {
  if (!isObject(body) || typeof body.taskToken !== 'string') return { problem: 'Send a JSON object with the taskToken the Task was given' }
  const token = body.taskToken
  if (call === 'heartbeat') return { token, answer: { kind: 'heartbeat' } }
  if (call === 'success') return typeof body.output === 'string' ? { token, answer: { kind: 'success', output: body.output } } : { problem: 'Send the result as output, a string of JSON, as SendTaskSuccess takes it' }
  for (const field of ['error', 'cause'] as const) if (body[field] !== undefined && typeof body[field] !== 'string') return { problem: `${field} must be a string` }
  return { token, answer: { kind: 'failure', error: (body.error as string | undefined) || 'States.TaskFailed', cause: (body.cause as string | undefined) ?? '' } }
}

/** The HTTP status and problem slug of each refusal: a token or answer that is not one, no such try, or one that ended. */
export const refusalProblems: Record<AnswerRefusal['error'], { status: number; slug: string }> = {
  InvalidToken: { status: 400, slug: 'invalid-token' },
  InvalidOutput: { status: 400, slug: 'invalid-output' },
  TaskDoesNotExist: { status: 404, slug: 'task-does-not-exist' },
  TaskTimedOut: { status: 409, slug: 'task-timed-out' },
}
