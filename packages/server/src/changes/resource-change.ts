import type { EventActor, EventOperation, KeyValue, ResourceModel } from '@protobase/schema'
import { encodeKey } from '@protobase/schema/internal'
import type { Row, TenantValue } from '../types'
import type { CoalescedChange } from './coalesce'

/** One record's change in one transaction, by field name: what events are matched against and payloads are built from. */
export type ResourceChange = {
  resource: string
  /** The record's key as its URL has it. */
  key: string
  operation: EventOperation
  /** The record before and after the change, without sensitive fields. */
  before?: Row
  after?: Row
  /** The fields an update changed, sensitive ones included. */
  changed: string[]
  actor: EventActor | null
  source: 'api' | 'database'
  tenant?: TenantValue
  transaction: string
  /** Grows with every change of a record, so receivers can drop stale events. */
  sequence: string
  /** When the change's transaction started, ISO 8601. */
  at: string
}

// The API's form for the types that JSON from the database holds differently: 64-bit integers and decimals as text.
const fieldValue = (type: string, value: unknown) => {
  if (value === null || value === undefined) return value
  if (type === 'bigint' || type === 'decimal') return String(value)
  if (type === 'integer') return Number(value)
  return value
}

/** A captured row by field name, fields without a captured column left out. */
export const recordOf = (model: ResourceModel, columns: Row): Row =>
  Object.fromEntries(
    Object.values(model.fields)
      .filter((field) => Object.hasOwn(columns, field.column))
      .map((field) => [field.name, fieldValue(field.type, columns[field.column])]),
  )

// A soft delete is an update that sets the soft delete field; clearing it is an undelete.
const operationOf = (model: ResourceModel, before?: Row, after?: Row): EventOperation => {
  if (!before) return 'create'
  if (!after) return 'delete'
  if (!model.softDelete) return 'update'
  const wasDeleted = before[model.softDelete] != null
  const isDeleted = after[model.softDelete] != null
  if (!wasDeleted && isDeleted) return 'delete'
  if (wasDeleted && !isDeleted) return 'undelete'
  return 'update'
}

const fieldsOf = (model: ResourceModel, columns: string[]) =>
  Object.values(model.fields)
    .filter((field) => columns.includes(field.column))
    .map((field) => field.name)

/** A coalesced change of the resource's table, by field name, with deletes and undeletes told apart from updates. */
export const resourceChange = (model: ResourceModel, change: CoalescedChange): ResourceChange => {
  const before = change.before ? recordOf(model, change.before) : undefined
  const after = change.after ? recordOf(model, change.after) : undefined
  const record = (after ?? before)!
  const tenant = model.tenant === undefined ? undefined : (record[model.tenant] as TenantValue | null | undefined)
  return {
    resource: model.name,
    key: encodeKey(model.primaryKey.map((name) => record[name] as KeyValue)),
    operation: operationOf(model, before, after),
    ...(before && { before }),
    ...(after && { after }),
    changed: fieldsOf(model, change.changed),
    actor: change.actor,
    source: change.actor ? 'api' : 'database',
    ...(tenant != null && { tenant }),
    transaction: change.transaction,
    sequence: change.sequence,
    at: change.at,
  }
}
