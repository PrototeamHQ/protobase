import { assistantRecords, type RecordKeyInput, type ToolRecord, type ToolRecords } from '../assistant/records'
import type { Deps } from '../deps'
import { listRecords } from '../list-service'
import { notFound } from '../problem'
import type { Row, Session } from '../types'
import { runWrite } from '../write-pipeline'
import { decodeKeyText } from '../key'
import { encodeKey } from '@protobase/schema'

/** The list parameters of the REST API (AIP-132), as values rather than query text. */
export type ListParams = {
  filter?: string
  order_by?: string
  page_size?: number
  page_token?: string
  fields?: string[]
  count?: 'exact'
  show_deleted?: boolean
}

/**
 * A page of records as the REST API lists it: each item with its `etag` and, unless the resource opts out, whether the
 * caller may update and delete it; and the token of the next page, empty on the last.
 */
export type RecordPage = {
  items: Array<Row & { etag?: string; permissions?: { update: boolean; delete: boolean } }>
  next_page_token: string
  total_size_estimate: number
  total_size?: number
}

/**
 * The app's resources as the caller: their access rules, row filters, tenant scope, validation and write hooks apply as
 * in the REST API. A refusal or a missing record rejects with an `HttpProblem`, which becomes the function's response
 * when it is not caught.
 */
export type FunctionRecords = ToolRecords & {
  list: (resource: string, params?: ListParams) => Promise<RecordPage>
  /** With `etag`, fails with 412 when the record changed since it was read. Resolves to the record as it was. */
  delete: (resource: string, key: RecordKeyInput, options?: { etag?: string }) => Promise<ToolRecord>
}

// Filters passed as values are not limited by a URL's length, as in `:search`.
const filterLength = 200_000

/** `FunctionRecords` over the admin's resources for `session`. */
export const callerRecords = (deps: Deps, session: Session): FunctionRecords => {
  const entryOf = (resource: string) => {
    const entry = deps.registry.find(resource)
    if (!entry) throw notFound(`There is no resource "${resource}"`)
    return entry
  }

  return {
    ...assistantRecords(deps, session),
    list: async (resource, params = {}) => (await listRecords(deps, entryOf(resource), session, params, filterLength)).body,
    delete: async (resource, input, { etag } = {}) => {
      const entry = entryOf(resource)
      const key = decodeKeyText(entry, Array.isArray(input) ? encodeKey(input) : String(input))
      return runWrite(deps, entry, session, { operation: 'delete', key, ifMatch: etag ?? '*' })
    },
  }
}
