import { encodeKey } from '@protobase/schema/internal'
import type { Deps } from '../deps'
import { decodeKeyText } from '../key'
import { listRecords } from '../list-service'
import { notFound } from '../problem'
import { readRecord } from '../read-service'
import type { Row, Session } from '../types'
import { runWrite } from '../write-pipeline'

/** A record's key: its URL text (`a,b` when composite), a scalar, or its parts. */
export type RecordKeyInput = string | number | Array<string | number>

/** A record as the user may see it, with the ETag a later update can pass to fail when someone changed it since. */
export type ToolRecord = { record: Row; etag: string }

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
 * The app's resources as the session's user: their access rules, tenant scope, validation and write hooks apply as
 * in the REST API. A refusal or a missing record rejects with an `HttpProblem`, which a tool can turn into text.
 */
export type ToolRecords = {
  list: (resource: string, params?: ListParams) => Promise<RecordPage>
  get: (resource: string, key: RecordKeyInput) => Promise<ToolRecord>
  create: (resource: string, data: Row) => Promise<ToolRecord>
  /** With `etag`, fails with 412 when the record changed since it was read; without, it updates any version. */
  update: (resource: string, key: RecordKeyInput, data: Row, options?: { etag?: string }) => Promise<ToolRecord>
  /**
   * With `etag`, fails with 412 when the record changed since it was read. A resource with `.softDelete()` keeps the
   * record, deleted; any other loses it. Resolves to the record as it was.
   */
  delete: (resource: string, key: RecordKeyInput, options?: { etag?: string }) => Promise<ToolRecord>
  /** The field a delete sets on a resource with `.softDelete()`, from its config; undefined when a delete removes the record. */
  softDeleteField: (resource: string) => Promise<string | undefined>
}

// Filters passed as values are not limited by a URL's length, as in `:search`.
const filterLength = 200_000

/** `ToolRecords` over the admin's resources for `session`. */
export const assistantRecords = (deps: Deps, session: Session): ToolRecords => {
  const entryOf = (resource: string) => {
    const entry = deps.registry.find(resource)
    if (!entry) throw notFound(`There is no resource "${resource}"`)
    return entry
  }
  const keyOf = (resource: string, key: RecordKeyInput) => {
    const entry = entryOf(resource)
    return { entry, key: decodeKeyText(entry, Array.isArray(key) ? encodeKey(key) : String(key)) }
  }

  return {
    list: async (resource, params = {}) => (await listRecords(deps, entryOf(resource), session, params, filterLength)).body,
    get: async (resource, input) => {
      const { entry, key } = keyOf(resource, input)
      const { record, etag } = await readRecord(deps, entry, session, key)
      return { record, etag }
    },
    create: async (resource, data) => runWrite(deps, entryOf(resource), session, { operation: 'create', body: data }),
    update: async (resource, input, data, { etag } = {}) => {
      const { entry, key } = keyOf(resource, input)
      return runWrite(deps, entry, session, { operation: 'update', key, body: data, ifMatch: etag ?? '*' })
    },
    delete: async (resource, input, { etag } = {}) => {
      const { entry, key } = keyOf(resource, input)
      return runWrite(deps, entry, session, { operation: 'delete', key, ifMatch: etag ?? '*' })
    },
    softDeleteField: async (resource) => entryOf(resource).model.softDelete,
  }
}

const withoutAdmin = () => Promise.reject(new Error('This assistant has no records: ToolContext.records works in the built-in assistant'))

/** Records for a turn without an admin around it, such as in a backend of its own: every call fails. */
export const noRecords: ToolRecords = { list: withoutAdmin, get: withoutAdmin, create: withoutAdmin, update: withoutAdmin, delete: withoutAdmin, softDeleteField: withoutAdmin }
