/**
 * `create_record`, `update_record` and `delete_record`: changing the app's records as the caller, through the REST API's
 * access rules, `validate` and write hooks, each after the user approves it, seeing in their language what changes. A
 * tool served over MCP calls `approve` before it changes anything, and at most once: MCP runs it again from the start
 * with the user's answer. Given `resources`, they change only those, and refuse any other before asking.
 */
import type { Row } from '../types'
import { deleteRecordTool } from './delete-record-tool'
import { approvalTexts, recordBefore } from './record-before'
import { keyOf, keyParameter, refused, resourceOf } from './record-tool-args'
import { defineTool } from './tools'
import { echoFieldsOf, fieldsParameter, invalidFields, writeEcho } from './write-echo'
import { createApproval, updateApproval } from './write-prompts'
import { forbiddenText, notApproved, onlyNote, outside, resourceParameterFor, type WriteRecordToolsInput } from './write-tool-limits'

export type { WriteRecordToolsInput }

const writes = { readOnlyHint: false, destructiveHint: false, openWorldHint: false }
const dataParameter = { type: 'object', description: 'Field names to values, as describe_resource gives the fields.' }

const dataOf = (value: unknown) => (typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Row) : undefined)

/** Creates a record of a resource once the user approves it, under the caller's access rules. */
export const createRecordTool = (input: WriteRecordToolsInput = {}) =>
  defineTool({
    name: 'create_record',
    description: `Creates a record of a resource and returns its key, new etag and, in record, the fields written and the read-only fields the write changed, as JSON ({ key, etag, record }). The user approves each write in their client first; nothing is written without it.${onlyNote(input)}`,
    parameters: {
      type: 'object',
      properties: { resource: resourceParameterFor(input), data: dataParameter, fields: fieldsParameter },
      required: ['resource', 'data'],
    },
    annotations: writes,
    run: async (args, context) => {
      const resource = resourceOf(args)
      const data = dataOf(args.data)
      if (!resource || !data) return 'Pass the resource and data as { "resource": "<name>", "data": { "<field>": <value> } }.'
      const fields = echoFieldsOf(args.fields)
      if (!fields) return invalidFields
      const refusal = outside(input, resource)
      if (refusal) return refusal
      const { text, described } = await approvalTexts(context, resource)
      const answer = await context.approve(createApproval(text, described, data))
      if (answer !== 'approved') return notApproved(answer)
      return context.records.create(resource, data).then((written) => JSON.stringify(writeEcho(described.model, written, data, undefined, fields)), refused)
    },
  })

/** Updates one record by its key once the user approves it, under the caller's access rules. */
export const updateRecordTool = (input: WriteRecordToolsInput = {}) =>
  defineTool({
    name: 'update_record',
    description: `Updates fields of one record of a resource by its key and returns its key, new etag and, in record, the fields written and the read-only fields the write changed, as JSON ({ key, etag, record }). Pass the etag get_record gave to fail when someone changed the record since. The user approves each write in their client first; nothing is written without it.${onlyNote(input)}`,
    parameters: {
      type: 'object',
      properties: {
        resource: resourceParameterFor(input),
        key: keyParameter,
        data: { ...dataParameter, description: 'The fields to change, names to new values, as describe_resource gives the fields.' },
        etag: { type: 'string', description: 'The etag get_record gave, to fail when the record changed since.' },
        fields: fieldsParameter,
      },
      required: ['resource', 'key', 'data'],
    },
    annotations: writes,
    run: async (args, context) => {
      const resource = resourceOf(args)
      const key = keyOf(args.key)
      const data = dataOf(args.data)
      if (!resource || key === undefined || !data) return 'Pass the resource, key and data as { "resource": "<name>", "key": "<key>", "data": { "<field>": <value> } }.'
      const fields = echoFieldsOf(args.fields)
      if (!fields) return invalidFields
      const refusal = outside(input, resource)
      if (refusal) return refusal
      // A delete or a restore goes only through delete_record's approval and delete rule, or the app
      const softDelete = await context.records.softDeleteField(resource).then((field) => ({ field }), refused)
      if (typeof softDelete === 'string') return softDelete
      if (softDelete.field && Object.hasOwn(data, softDelete.field)) return forbiddenText(`update_record does not set ${softDelete.field}, which deleting sets; delete with delete_record. Nothing was written.`)
      const etag = typeof args.etag === 'string' && args.etag ? args.etag : undefined
      const before = await recordBefore(context, resource, key, etag)
      if (typeof before === 'string') return before
      const { text, described } = await approvalTexts(context, resource)
      const answer = await context.approve(updateApproval(text, described, key, before?.record ?? {}, data))
      if (answer !== 'approved') return notApproved(answer)
      return context.records.update(resource, key, data, { etag }).then((written) => JSON.stringify(writeEcho(described.model, written, data, before?.record, fields)), refused)
    },
  })

/** `create_record`, `update_record` and `delete_record`, on the resources `input` allows. */
export const writeRecordTools = (input: WriteRecordToolsInput = {}) => [createRecordTool(input), updateRecordTool(input), deleteRecordTool(input)]
