/**
 * The `batch_write` tool's arguments, checked before anything is asked or written: only creates, updates and deletes,
 * only the fields each takes, an update's ETag always given, and no more operations than the REST batch takes. A
 * delete's ETag passes exactly as sent, so one left out stays left out. A create's or update's `fields`, what to give
 * back of its record, comes apart from the operation the REST batch runs.
 */
import { maxOperations, type BatchOperation } from '../batch/schema'
import { echoFieldsOf } from './write-echo'

export type WriteOperation = Extract<BatchOperation, { op: 'create' | 'update' | 'delete' }>

const fieldsOf = {
  create: ['op', 'resource', 'data', 'ref', 'fields'],
  update: ['op', 'resource', 'key', 'etag', 'data', 'fields'],
  delete: ['op', 'resource', 'key', 'etag'],
}

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)
const isText = (value: unknown): value is string => typeof value === 'string' && value.trim() !== ''

const isRef = (value: unknown) =>
  isObject(value) && isText(value.$ref) && Object.keys(value).every((name) => name === '$ref' || (name === 'field' && isText(value.field)))

const isPart = (value: unknown) => typeof value === 'string' || (typeof value === 'number' && Number.isFinite(value)) || isRef(value)

const isKey = (value: unknown) => isPart(value) || (Array.isArray(value) && value.length > 0 && value.every(isPart))

// Why the operation at `index` is not one this tool runs, or undefined when it is.
const problemOf = (value: unknown, index: number) => {
  const at = `operations[${index}]`
  if (!isObject(value)) return `${at} is not an object`
  const op = value.op
  if (op !== 'create' && op !== 'update' && op !== 'delete') return `${at} has op ${JSON.stringify(op)}; a batch takes create, update and delete`
  const unknown = Object.keys(value).filter((name) => !fieldsOf[op].includes(name))
  if (unknown.length > 0) return `${at} has fields a ${op} does not take: ${unknown.map((name) => JSON.stringify(name)).join(', ')}`
  if (!isText(value.resource)) return `${at} needs the resource's name`
  if (op !== 'delete' && !isObject(value.data)) return `${at} needs its data as an object of field names to values`
  if (op !== 'delete' && !echoFieldsOf(value.fields)) return `${at} has fields that are not a list of field names`
  if (op === 'create') return value.ref === undefined || isText(value.ref) ? undefined : `${at} has a ref that is not a name`
  if (!isKey(value.key)) return `${at} needs the record's key: a string, a number, a list of them, or { "$ref": "<name>" }`
  if (op === 'update' && !isText(value.etag)) return `${at} needs the etag the record was read with, or "*" to update any version`
  if (op === 'delete' && 'etag' in value && typeof value.etag !== 'string') return `${at} has an etag that is not a string`
  return undefined
}

/** The operations to run, each with the fields to give back of its record, or why the batch is refused, naming the operation at fault. */
export const batchOperationsOf = (args: Record<string, unknown>): { operations: WriteOperation[]; fields: string[][] } | { problem: string } => {
  const unknown = Object.keys(args).filter((name) => name !== 'operations')
  if (unknown.length > 0) return { problem: `The batch takes only "operations", not ${unknown.map((name) => JSON.stringify(name)).join(', ')}` }
  const operations = args.operations
  if (!Array.isArray(operations) || operations.length === 0) return { problem: 'Pass the writes as { "operations": [{ "op": "create" | "update" | "delete", "resource": "<name>", ... }] }' }
  if (operations.length > maxOperations) return { problem: `A batch takes at most ${maxOperations} operations, not ${operations.length}` }
  for (const [index, operation] of operations.entries()) {
    const problem = problemOf(operation, index)
    if (problem) return { problem }
  }
  const refs = operations.flatMap((operation) => (operation.ref === undefined ? [] : [operation.ref]))
  if (new Set(refs).size !== refs.length) return { problem: 'Each create may use a ref name once' }
  const fields = operations.map((operation) => echoFieldsOf(operation.fields)!)
  const run = operations.map(({ fields: _fields, ...operation }) => operation)
  return { operations: run as WriteOperation[], fields }
}
