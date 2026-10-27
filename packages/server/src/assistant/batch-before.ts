import { ifMatchSatisfied } from '../etag'
import { HttpProblem, preconditionFailed } from '../problem'
import type { Row } from '../types'
import type { WriteOperation } from './batch-write-args'
import { hidden } from './record-before'
import { keyOf } from './record-tool-args'
import type { RecordKeyInput } from './records'
import type { ToolContext } from './tools'

// The problem named for the operation it came from, as the REST batch's refusals are.
const atOperation = (error: unknown, index: number, { op, resource }: WriteOperation) =>
  error instanceof HttpProblem ? new HttpProblem(error.status, error.slug, error.title, error.detail, { ...error.extras, operation: index, op, resource }) : error

const recordAt = async (context: ToolContext, operation: WriteOperation & { etag?: string }, key: RecordKeyInput, index: number) => {
  const current = await context.records.get(operation.resource, key).catch((error: unknown) => {
    if (hidden(error)) return undefined
    throw atOperation(error, index, operation)
  })
  if (current && operation.etag && !ifMatchSatisfied(operation.etag, current.etag)) {
    throw atOperation(preconditionFailed('The record changed since it was read; fetch it again'), index, operation)
  }
  return current?.record
}

/**
 * The records the first `count` operations update or delete, by index, as the caller reads them now, for the approval
 * to name and show what changes; one they may not read, or whose key points at a create in the batch, is left out. A
 * record changed since its operation's etag rejects before asking, as the batch would fail after the user approved;
 * so does any other refusal of the read, naming the operation.
 */
export const batchBefore = async (context: ToolContext, operations: WriteOperation[], count: number) => {
  const before = new Map<number, Row>()
  for (const [index, operation] of operations.slice(0, count).entries()) {
    if (operation.op === 'create') continue
    const key = keyOf(operation.key)
    if (key === undefined) continue
    const record = await recordAt(context, operation, key, index)
    if (record) before.set(index, record)
  }
  return before
}
