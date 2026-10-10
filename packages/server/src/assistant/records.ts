import { encodeKey } from '@protobase/schema'
import type { Deps } from '../deps'
import { decodeKeyText } from '../key'
import { notFound } from '../problem'
import { readRecord } from '../read-service'
import type { Row, Session } from '../types'
import { runWrite } from '../write-pipeline'

/** A record's key: its URL text (`a,b` when composite), a scalar, or its parts. */
export type RecordKeyInput = string | number | Array<string | number>

/** A record as the user may see it, with the ETag a later update can pass to fail when someone changed it since. */
export type ToolRecord = { record: Row; etag: string }

/**
 * The app's resources as the session's user: their access rules, tenant scope, validation and write hooks apply as
 * in the REST API. A refusal or a missing record rejects with an `HttpProblem`, which a tool can turn into text.
 */
export type ToolRecords = {
  get: (resource: string, key: RecordKeyInput) => Promise<ToolRecord>
  create: (resource: string, data: Row) => Promise<ToolRecord>
  /** With `etag`, fails with 412 when the record changed since it was read; without, it updates any version. */
  update: (resource: string, key: RecordKeyInput, data: Row, options?: { etag?: string }) => Promise<ToolRecord>
}

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
  }
}

const withoutAdmin = () => Promise.reject(new Error('This assistant has no records: ToolContext.records works in the built-in assistant'))

/** Records for a turn without an admin around it, such as in a backend of its own: every call fails. */
export const noRecords: ToolRecords = { get: withoutAdmin, create: withoutAdmin, update: withoutAdmin }
