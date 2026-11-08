import { workflowRunTracePath, type WorkflowRunTrace } from '@protobase/schema/internal'
import type { Transport } from './transport'

export type { WorkflowRunTrace, WorkflowTraceStep } from '@protobase/schema/internal'

/**
 * A workflow run's trace (`/api/workflows/runs/<id>/trace`): the steps it ran so far, in order, with their input,
 * output and logs; none when the run keeps no trace. With `after`, only the steps after the first `after`, as
 * `WorkflowRunTrace` says. Rejects with an `ApiError` for a caller who may not read the run
 * or its trace.
 */
export const workflowRunTraceClient = (send: Transport) => async (runId: string, after = 0): Promise<WorkflowRunTrace> =>
  (await send({ method: 'GET', path: workflowRunTracePath('', runId, after), system: true })).json() as Promise<WorkflowRunTrace>
