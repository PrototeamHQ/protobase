import type { Deps } from '../deps'
import { problemOf } from '../error-handler'
import { HttpProblem, badRequest, notFound } from '../problem'
import type { Entry } from '../registry'
import { requestAccess, type RequestAccess } from '../request-access'
import { writeTransaction } from '../transactions'
import type { Row, Session } from '../types'
import { keyOf, type WriteResult } from '../write-shared'
import { writeIn } from '../write-pipeline'
import { resolveData, resolveKey, type Created } from './refs'
import { reorderIn } from './reorder'
import type { BatchOperation } from './schema'

export type BatchResult =
  | { op: 'create'; resource: string; ref?: string; record: Row; etag: string }
  | { op: 'update'; resource: string; record: Row; etag: string }
  | { op: 'delete'; resource: string; deleted: true }
  | { op: 'reorder'; resource: string; records: WriteResult[] }

const entryOf = (deps: Deps, name: string): Entry => {
  const entry = deps.registry.find(name)
  if (!entry) throw notFound(`There is no resource "${name}"`)
  return entry
}

// A failure keeps its problem, and says which operation it was.
const atOperation = (error: unknown, index: number, operation: BatchOperation) => {
  const known = problemOf(error)
  if (!known) throw error
  return new HttpProblem(known.status, known.slug, known.title, known.detail, { ...known.extras, operation: index, op: operation.op, resource: operation.resource }, known.headers)
}

/**
 * Runs the operations in order inside ONE transaction, each through the normal write pipeline (validation, access with row
 * filters and record-level rules, tenant, ETags, hooks). Any failure rolls the whole batch back and names the failing operation.
 */
export const runBatch = async (deps: Deps, session: Session, operations: BatchOperation[]): Promise<BatchResult[]> => {
  const refs = operations.flatMap((operation) => (operation.op === 'create' && operation.ref ? [operation.ref] : []))
  if (new Set(refs).size !== refs.length) throw badRequest('invalid-parameter', 'Each create may use a ref name once')
  const accesses = new Map<string, RequestAccess>()
  const accessFor = async (entry: Entry) => {
    const known = accesses.get(entry.name)
    if (known) return known
    const access = await requestAccess(deps, entry, session)
    accesses.set(entry.name, access)
    return access
  }

  return writeTransaction(deps.db, deps.statementTimeoutMs, async (trx) => {
    const created = new Map<string, Created>()
    const results: BatchResult[] = []
    for (const [index, operation] of operations.entries()) {
      try {
        const entry = entryOf(deps, operation.resource)
        const access = await accessFor(entry)
        if (operation.op === 'create') {
          const written = await writeIn(trx, deps, access, { operation: 'create', body: resolveData(created, operation.data) })
          if (operation.ref) created.set(operation.ref, { entry, key: keyOf(access, written.record), record: written.record })
          results.push({ op: 'create', resource: entry.name, ...(operation.ref && { ref: operation.ref }), ...written })
        } else if (operation.op === 'update') {
          const written = await writeIn(trx, deps, access, { operation: 'update', key: resolveKey(created, entry, operation.key), body: resolveData(created, operation.data), ifMatch: operation.etag ?? null })
          results.push({ op: 'update', resource: entry.name, ...written })
        } else if (operation.op === 'delete') {
          await writeIn(trx, deps, access, { operation: 'delete', key: resolveKey(created, entry, operation.key), ifMatch: operation.etag ?? null })
          results.push({ op: 'delete', resource: entry.name, deleted: true })
        } else {
          const keys = operation.keys.map((key) => resolveKey(created, entry, key))
          const records = await reorderIn(trx, deps, access, { field: operation.field, keys, etags: operation.etags ?? {} })
          results.push({ op: 'reorder', resource: entry.name, records })
        }
      } catch (error) {
        throw atOperation(error, index, operation)
      }
    }
    return results
  })
}

