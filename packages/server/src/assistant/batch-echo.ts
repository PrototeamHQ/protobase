/**
 * What `batch_write` gives back of each operation: a create's or update's record small, as `writeEcho` makes it, and a
 * delete as the REST batch says it.
 */
import type { BatchResult } from '../batch/run-batch'
import { HttpProblem } from '../problem'
import type { Row } from '../types'
import type { WriteOperation } from './batch-write-args'
import { keyOf } from './record-tool-args'
import type { ToolContext } from './tools'
import { writeEcho } from './write-echo'

// A refusal of the read, such as a record the caller may not read, leaves the batch's own run to refuse or write it.
const unread = (error: unknown) => {
  if (error instanceof HttpProblem && error.status < 500) return undefined
  throw error
}

/**
 * Each update's record as the caller reads it before the batch, for the read-only fields the batch changes; undefined
 * for a create, a delete, and an update of a record created earlier in the batch, whose key is a `$ref`.
 */
export const recordsBefore = async (context: ToolContext, operations: WriteOperation[]) => {
  const befores: Array<Row | undefined> = []
  for (const operation of operations) {
    const key = operation.op === 'update' ? keyOf(operation.key) : undefined
    befores.push(key === undefined ? undefined : await context.records.get(operation.resource, key).then((current) => current.record, unread))
  }
  return befores
}

/** The batch's results, each create's and update's record cut to its key, etag, written and changed read-only fields, and `fields`. */
export const batchEcho = async (context: ToolContext, operations: WriteOperation[], results: BatchResult[], befores: Array<Row | undefined>, fields: string[][]) => {
  const { models } = await context.resources()
  return results.map((result, index) => {
    if (result.op !== 'create' && result.op !== 'update') return result
    const operation = operations[index] as Extract<WriteOperation, { op: 'create' | 'update' }>
    const { record: _record, etag: _etag, ...rest } = result
    const model = models.find((candidate) => candidate.name === result.resource)
    return { ...rest, ...writeEcho(model, result, operation.data, befores[index], fields[index]!) }
  })
}
