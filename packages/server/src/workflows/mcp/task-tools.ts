/**
 * `send_task_success`, `send_task_failure` and `send_task_heartbeat`: answering a Task that waits for an outside result
 * with the token it handed off, as Step Functions' SendTaskSuccess, SendTaskFailure and SendTaskHeartbeat do, as the
 * caller and after the user approves it in their client.
 */
import type { ApprovalRequest } from '../../assistant/approval'
import { defineTool } from '../../assistant/tools'
import { notApproved, onlyNote, outside, type WriteRecordToolsInput } from '../../assistant/write-tool-limits'
import type { AnswerTaskAs } from '../tasks/answer-as'
import type { TaskAnswer } from '@protobase/workflows'
import { textOf } from './workflow-tool-args'

const writes = { readOnlyHint: false, destructiveHint: false, openWorldHint: true }
const tokenParameter = { type: 'string', description: 'The token the Task handed off, which its Arguments read as $states.context.Task.Token.' }
const refusals = 'A refusal comes back as { error, message }: InvalidToken, TaskDoesNotExist (no waiting Task you may see has it), TaskTimedOut (the Task or its run ended) or InvalidOutput.'

const answerTool = (name: string, description: string, properties: Record<string, unknown>, answerOf: (args: Record<string, unknown>) => TaskAnswer, approval: (args: Record<string, unknown>) => ApprovalRequest, answer: AnswerTaskAs, input: WriteRecordToolsInput) =>
  defineTool({
    name,
    description: `${description} ${refusals} The user approves it in their client first.${onlyNote(input)}`,
    parameters: { type: 'object', properties: { task_token: tokenParameter, ...properties }, required: ['task_token', ...(name === 'send_task_success' ? ['output'] : [])] },
    annotations: writes,
    run: async (args, context) => {
      const token = textOf(args.task_token)
      if (!token) return 'Pass { "task_token": "<the token the Task handed off>" }.'
      if ('output' in properties && typeof args.output !== 'string') return 'Pass output as a string of JSON, as SendTaskSuccess takes it, such as "{\\"approved\\": true}".'
      const refusal = outside(input, 'workflow_runs')
      if (refusal) return refusal
      const given = answerOf(args)
      const approved = await context.approve(approval(args))
      if (approved !== 'approved') return notApproved(approved)
      return JSON.stringify(await answer(context.session, token, given))
    },
  })

/** The tools that answer waiting Tasks, on the resources `input` allows. */
export const taskTools = (input: WriteRecordToolsInput, answer: AnswerTaskAs) => [
  answerTool(
    'send_task_success',
    "Ends a Task that waits for an outside result (its Resource ends in .waitForTaskToken) with its result, output, a string of JSON up to 256 KiB as Step Functions' SendTaskSuccess takes it, which its Output and Assign read parsed as $states.result, and wakes its run. Returns JSON { run } with the run's id.",
    { output: { type: 'string', description: 'The Task\'s result as a string of JSON, such as "{\\"approved\\": true}".' } },
    (args) => ({ kind: 'success', output: args.output as string }),
    (args) => ({ title: 'Send this result to a waiting workflow step?', code: args.output as string }),
    answer,
    input,
  ),
  answerTool(
    'send_task_failure',
    'Fails a Task that waits for an outside result with an error name (States.TaskFailed by default) and a cause, which its Retry and Catch take as any failure, and wakes its run. Returns JSON { run }.',
    { error: { type: 'string', description: 'The error name, at most 256 characters, such as Approval.Refused.' }, cause: { type: 'string', description: 'What went wrong, for people.' } },
    (args) => ({ kind: 'failure', error: textOf(args.error) || 'States.TaskFailed', cause: textOf(args.cause) ?? '' }),
    (args) => ({ title: 'Fail a waiting workflow step?', fields: [{ label: 'Error', value: textOf(args.error) || 'States.TaskFailed' }, { label: 'Cause', value: textOf(args.cause) ?? '' }] }),
    answer,
    input,
  ),
  answerTool(
    'send_task_heartbeat',
    "Tells a Task that waits for an outside result that its work goes on, so its HeartbeatSeconds count again from now. Returns JSON { run }.",
    {},
    () => ({ kind: 'heartbeat' }),
    () => ({ title: 'Tell a waiting workflow step its work goes on?' }),
    answer,
    input,
  ),
]
