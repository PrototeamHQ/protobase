import { encodeKey } from '@protobase/schema/internal'
import { assistantRecords, type RecordKeyInput, type ToolRecord, type ToolRecords } from '../assistant/records'
import type { Deps } from '../deps'
import { decodeKeyText } from '../key'
import { notFound } from '../problem'
import type { Session } from '../types'
import { runWrite } from '../write-pipeline'

export type { ListParams, RecordPage } from '../assistant/records'

/**
 * The app's resources as the caller: their access rules, row filters, tenant scope, validation and write hooks apply as
 * in the REST API. A refusal or a missing record rejects with an `HttpProblem`, which becomes the function's response
 * when it is not caught.
 */
export type FunctionRecords = ToolRecords & {
  /** With `etag`, fails with 412 when the record changed since it was read. Resolves to the record as it was. */
  delete: (resource: string, key: RecordKeyInput, options?: { etag?: string }) => Promise<ToolRecord>
}

/** `FunctionRecords` over the admin's resources for `session`. */
export const callerRecords = (deps: Deps, session: Session): FunctionRecords => ({
  ...assistantRecords(deps, session),
  delete: async (resource, input, { etag } = {}) => {
    const entry = deps.registry.find(resource)
    if (!entry) throw notFound(`There is no resource "${resource}"`)
    const key = decodeKeyText(entry, Array.isArray(input) ? encodeKey(input) : String(input))
    return runWrite(deps, entry, session, { operation: 'delete', key, ifMatch: etag ?? '*' })
  },
})
