/**
 * `batch_write`: many creates, updates and deletes across resources in one transaction, through the REST API's batch
 * write, after the user approves the batch once, seeing each write in their language. Over MCP the tool runs again from
 * the start with the user's answer, so everything before `approve` only checks the arguments and reads what the approval
 * names: nothing is written.
 */
import { HttpProblem } from '../problem'
import { batchApproval, shownOperations } from './batch-approval'
import { batchBefore } from './batch-before'
import { batchEcho, recordsBefore } from './batch-echo'
import { batchOperationsOf, type WriteOperation } from './batch-write-args'
import { defineTool, type ToolContext } from './tools'
import { fieldsParameter } from './write-echo'
import { writeText } from './write-messages'
import { describedResource } from './write-prompts'
import type { WriteRecordToolsInput } from './write-record-tools'

const writes = { readOnlyHint: false, destructiveHint: true, openWorldHint: false }

const refusal = (error: string, message: string, extras: Record<string, unknown> = {}) => JSON.stringify({ error, message, ...extras })

// A refusal names the operation that failed, with what else the REST batch's problem says.
const refused = (error: unknown) => {
  if (!(error instanceof HttpProblem) || error.status >= 500) throw error
  return refusal(error.slug, `${error.detail}; nothing was written.`, error.extras)
}

const outside = ({ resources }: WriteRecordToolsInput, operations: WriteOperation[]) => {
  if (!resources) return undefined
  const index = operations.findIndex((operation) => !resources.includes(operation.resource))
  if (index === -1) return undefined
  const { op, resource } = operations[index]!
  return refusal('forbidden', `Writes over MCP reach only ${resources.join(', ')}; operations[${index}] names another resource, so nothing was written.`, { operation: index, op, resource })
}

// A delete or a restore goes only through a delete operation's approval and delete rule, or the app, as in update_record.
const softDeleteSet = async (context: ToolContext, operations: WriteOperation[]) => {
  for (const [index, operation] of operations.entries()) {
    if (operation.op !== 'update') continue
    const field = await context.records.softDeleteField(operation.resource)
    if (field && Object.hasOwn(operation.data, field)) {
      return refusal('forbidden', `operations[${index}] sets ${field}, which deleting sets; delete with a delete operation. Nothing was written.`, { operation: index, op: operation.op, resource: operation.resource })
    }
  }
  return undefined
}

// The approval of `operations`, after reading the records it names, or the refusal of one of those reads.
const approvalOf = async (context: ToolContext, operations: WriteOperation[]) => {
  const before = await batchBefore(context, operations, shownOperations).catch(refused)
  if (typeof before === 'string') return before
  const readable = await context.resources()
  return batchApproval({
    text: writeText(context.locale ?? 'en'),
    described: (resource) => describedResource(readable, resource),
    operations,
    before,
    softDeletes: new Set(readable.models.filter((model) => model.softDelete).map((model) => model.name)),
  })
}

const operationsParameter = (input: WriteRecordToolsInput) => ({
  type: 'array',
  minItems: 1,
  description: `The writes, run in order.${input.resources ? ` Each names one of ${input.resources.join(', ')}.` : ''}`,
  items: {
    type: 'object',
    properties: {
      // Named in the description rather than as an enum, which MCP's own argument check would refuse with a vaguer message.
      op: { type: 'string', description: 'create, update or delete.' },
      resource: { type: 'string', description: 'The resource\'s name, as list_resources gives it.' },
      key: { anyOf: [{ type: 'string' }, { type: 'number' }, { type: 'array' }, { type: 'object' }], description: 'An update\'s or delete\'s record key: its value, the values of its key fields in order, or { "$ref": "<name>" } for a record created earlier in the batch.' },
      etag: { type: 'string', description: 'The etag the record was read with: required on an update ("*" for any version), optional on a delete.' },
      data: { type: 'object', description: 'A create\'s or update\'s field names to values; a value { "$ref": "<name>" } is the key of a record created earlier in the batch.' },
      ref: { type: 'string', description: 'A create\'s name, for later operations to point at.' },
      fields: fieldsParameter,
    },
  },
})

/** Runs many writes in one transaction once the user approves them, under the caller's access rules. */
export const batchWriteTool = (input: WriteRecordToolsInput = {}) =>
  defineTool({
    name: 'batch_write',
    description: `Creates, updates and deletes records across resources in one transaction: either all are written or none, and an update or delete with an etag fails the batch when its record changed since. Returns { results }: each created or updated record's key, new etag and, in record, the fields written and the read-only fields the batch changed. The user approves the batch in their client first; nothing is written without it.${input.resources ? ` It writes only ${input.resources.join(', ')}.` : ''}`,
    parameters: { type: 'object', properties: { operations: operationsParameter(input) }, required: ['operations'] },
    annotations: writes,
    run: async (args, context) => {
      const parsed = batchOperationsOf(args)
      if ('problem' in parsed) return refusal('invalid-argument', `${parsed.problem}; nothing was written.`)
      const { operations, fields } = parsed
      const outsideRefusal = outside(input, operations)
      if (outsideRefusal) return outsideRefusal
      const softDeleteRefusal = await softDeleteSet(context, operations).catch(refused)
      if (softDeleteRefusal) return softDeleteRefusal
      const approval = await approvalOf(context, operations)
      if (typeof approval === 'string') return approval
      const answer = await context.approve(approval)
      if (answer !== 'approved') return `The user did not approve this batch (${answer}); nothing was written.`
      const befores = await recordsBefore(context, operations)
      return context.records.batch(operations).then(async (results) => JSON.stringify({ results: await batchEcho(context, operations, results, befores, fields) }), refused)
    },
  })
