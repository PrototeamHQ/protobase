/**
 * What the user approves for a batch: each write named and listed as its single write's approval names and lists it,
 * in the texts of the user's language, up to a count, so a batch of hundreds stays readable. A key or value pointing at
 * a create in the batch is named by that write's number.
 */
import type { RefInput } from '../batch/schema'
import type { Row } from '../types'
import type { ApprovalRequest } from './approval'
import type { WriteOperation } from './batch-write-args'
import type { RecordKeyInput } from './records'
import { createChange, recordName, resourceLabel, shown, updateChange, type ApprovalField, type Described, type WriteTexts } from './write-prompts'

export const shownOperations = 50

export type BatchApprovalInput = {
  text: WriteTexts
  described: (resource: string) => Described
  operations: WriteOperation[]
  /** The record each shown update or delete changes, by the operation's index, as the caller reads it now. */
  before: Map<number, Row>
  /** The resources whose deletes can be restored; a delete on any other is permanent. */
  softDeletes: Set<string>
}

const isRef = (value: unknown): value is RefInput => typeof value === 'object' && value !== null && typeof (value as RefInput).$ref === 'string'

const refOfKey = (key: unknown) => (Array.isArray(key) ? key.find(isRef) : isRef(key) ? key : undefined)

const joined = (fields: ApprovalField[], none: string) => (fields.length > 0 ? fields.map(({ label, value }) => `${label}: ${value}`).join('; ') : none)

/** The approval of `operations` as one transaction. */
export const batchApproval = ({ text, described, operations, before, softDeletes }: BatchApprovalInput): ApprovalRequest => {
  const creates = new Map(operations.flatMap((operation, index) => (operation.op === 'create' && operation.ref ? [[operation.ref, { index, resource: operation.resource }]] : [])))
  const refName = ({ $ref }: RefInput) => {
    const created = creates.get($ref)
    return created ? text('fromWrite', { resource: resourceLabel(described(created.resource)), write: created.index + 1 }) : `"${shown($ref)}"`
  }
  const dataOf = (data: Row) => Object.fromEntries(Object.entries(data).map(([name, value]) => [name, isRef(value) ? refName(value) : value]))
  const nameOf = (operation: Extract<WriteOperation, { key: unknown }>, index: number) => {
    const ref = refOfKey(operation.key)
    return ref ? refName(ref) : recordName(described(operation.resource), operation.key as RecordKeyInput, before.get(index) ?? {})
  }

  const entryOf = (operation: WriteOperation, index: number): ApprovalField => {
    const resource = described(operation.resource)
    const label = (action: string) => `${index + 1}. ${action}`
    if (operation.op === 'create') {
      const { action, fields } = createChange(text, resource, dataOf(operation.data))
      return { label: label(action), value: joined(fields, text('noFields')) }
    }
    if (operation.op === 'update') {
      const { action, fields } = updateChange(text, resource, nameOf(operation, index), before.get(index) ?? {}, dataOf(operation.data))
      return { label: label(action), value: joined(fields, text('noChanges')) }
    }
    return { label: label(text('deleteAction', { record: nameOf(operation, index) })), value: softDeletes.has(operation.resource) ? text('restorable') : text('permanent') }
  }

  const permanent = operations.filter((operation) => operation.op === 'delete' && !softDeletes.has(operation.resource)).length
  const rest = operations.length - shownOperations
  return {
    title: text('batchTitle', { count: operations.length }),
    body: [...(permanent > 0 ? [text('permanentDeletes', { count: permanent })] : []), text('allOrNone'), ...(rest > 0 ? [text('moreWrites', { count: rest })] : [])].join('\n'),
    fields: operations.slice(0, shownOperations).map(entryOf),
    tone: permanent > 0 ? 'danger' : 'warning',
    approveLabel: text('writeAll'),
    rejectLabel: text('reject'),
  }
}
