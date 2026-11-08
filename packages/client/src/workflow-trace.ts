import { workflowRunTracePath, type WorkflowRunTrace } from '@protobase/schema/internal'
import type { Transport } from './transport'

export type { WorkflowRunTrace, WorkflowTraceStep } from '@protobase/schema/internal'

/**
 * A workflow run's trace (`/api/workflows/runs/<id>/trace`): the steps it ran so far, in order, with their input,
 * output and logs; none when the run keeps no trace. Rejects with an `ApiError` for a caller who may not read the run
 * or its trace.
 */
export const workflowRunTraceClient = (send: Transport) => async (runId: string): Promise<WorkflowRunTrace> =>
  (await send({ method: 'GET', path: workflowRunTracePath('', runId), system: true })).json() as Promise<WorkflowRunTrace>
