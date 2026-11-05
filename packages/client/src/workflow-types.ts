import { workflowTypesPath, type WorkflowTypeList } from '@protobase/schema/internal'
import type { Transport } from './transport'

export type { WorkflowTypeEntry, WorkflowTypeList } from '@protobase/schema/internal'

/**
 * The app's workflow trigger and step types (`/api/workflows/types`), with the JSON Schema of each one's input, in an
 * app with workflows: the graph editor draws its menus and forms from them. Rejects with an `ApiError` for a caller who
 * may not read workflows.
 */
export const workflowTypesClient = (send: Transport) => async (): Promise<WorkflowTypeList> =>
  (await send({ method: 'GET', path: workflowTypesPath(''), system: true })).json() as Promise<WorkflowTypeList>
