import { assistantRecords, type ToolRecords } from '../assistant/records'
import type { Deps } from '../deps'
import type { Session } from '../types'

export type { ListParams, RecordPage } from '../assistant/records'

/**
 * The app's resources as the caller: their access rules, row filters, tenant scope, validation and write hooks apply as
 * in the REST API. A refusal or a missing record rejects with an `HttpProblem`, which becomes the function's response
 * when it is not caught.
 */
export type FunctionRecords = Omit<ToolRecords, 'batch' | 'aggregate'>

/** `FunctionRecords` over the admin's resources for `session`; the batch and the aggregate are the tools' alone. */
export const callerRecords = (deps: Deps, session: Session): FunctionRecords => {
  const { batch: _batch, aggregate: _aggregate, ...records } = assistantRecords(deps, session)
  return records
}
