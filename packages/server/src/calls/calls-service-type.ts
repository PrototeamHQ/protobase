import type { CallRecordKey } from './call-member'
import type { CallRecord } from './call-store'
import type { CallsRuntime } from './calls-runtime'

/** An app's calls as its functions and routes reach them: loaded at their first use, and the stored form of a record's key. */
export type CallsService = {
  runtime: () => Promise<CallsRuntime>
  /** The resource and encoded key of a record a function names; a 404 problem for an unknown resource. */
  recordOf: (resource: string, key: CallRecordKey) => CallRecord
}
