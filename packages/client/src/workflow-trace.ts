import { workflowRunTracePath, type WorkflowRunTrace, type WorkflowTraceHeld } from '@protobase/schema/internal'
import type { Transport } from './transport'

export type { WorkflowRunTrace, WorkflowTraceHeld, WorkflowTraceStep } from '@protobase/schema/internal'

/**
 * A workflow run's trace (`/api/workflows/runs/<id>/trace`): the steps it ran so far, in order, with their input,
 * output and logs; none when the run keeps no trace. With the steps it `held`, only the steps after them while they are
 * still the trace's first, as `WorkflowRunTrace` says. Rejects with an `ApiError` for a caller who may not read the run
 * or its trace.
 */
export const workflowRunTraceClient = (send: Transport) => async (runId: string, held?: WorkflowTraceHeld): Promise<WorkflowRunTrace> =>
  (await send({ method: 'GET', path: workflowRunTracePath('', runId, held), system: true })).json() as Promise<WorkflowRunTrace>
