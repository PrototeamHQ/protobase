/**
 * `create_record` and `update_record`: changing the app's records as the caller, through the REST API's access rules,
 * `validate` and write hooks, each after the user approves it. A tool served over MCP calls `approve` before it changes
 * anything, and at most once: MCP runs it again from the start with the user's answer. Given `resources`, they change
 * only those, and refuse any other before asking.
 */
import type { Row } from '../types'
import { keyOf, keyParameter, refused, resourceOf, resourceParameter } from './record-tool-args'
import { defineTool } from './tools'

const writes = { readOnlyHint: false, destructiveHint: false, openWorldHint: false }
const dataParameter = { type: 'object', description: 'Field names to values, as list_resources gives the fields.' }

const dataOf = (value: unknown) => (typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Row) : undefined)

/** The resources the write tools may change: any the caller may write, or only those listed. */
export type WriteRecordToolsInput = { resources?: string[] }

// Named in the description rather than as an enum, which MCP's own argument check would refuse with a vaguer message.
const resourceParameterFor = ({ resources }: WriteRecordToolsInput) =>
  resources ? { ...resourceParameter, description: `The resource's name: one of ${resources.join(', ')}.` } : resourceParameter

const onlyNote = ({ resources }: WriteRecordToolsInput) => (resources ? ` It writes only ${resources.join(', ')}.` : '')

// The same shape as a refusal of the access rules, so the client reads both alike.
const outside = ({ resources }: WriteRecordToolsInput, resource: string) =>
  resources && !resources.includes(resource) ? JSON.stringify({ error: 'forbidden', message: `Writes over MCP reach only ${resources.join(', ')}, not ${resource}; nothing was written.` }) : undefined

const notApproved = (answer: string) => `The user did not approve this change (${answer}); nothing was written.`

/** Creates a record of a resource once the user approves it, under the caller's access rules. */
export const createRecordTool = (input: WriteRecordToolsInput = {}) =>
  defineTool({
    name: 'create_record',
    description: `Creates a record of a resource and returns it as JSON ({ record, etag }). The user approves each write in their client first; nothing is written without it.${onlyNote(input)}`,
    parameters: {
      type: 'object',
      properties: { resource: resourceParameterFor(input), data: dataParameter },
      required: ['resource', 'data'],
    },
    annotations: writes,
    run: async (args, context) => {
      const resource = resourceOf(args)
      const data = dataOf(args.data)
      if (!resource || !data) return 'Pass the resource and data as { "resource": "<name>", "data": { "<field>": <value> } }.'
      const refusal = outside(input, resource)
      if (refusal) return refusal
      const answer = await context.approve({ title: `Create a record in ${resource}?`, code: JSON.stringify(data, null, 2), approveLabel: 'Create' })
      if (answer !== 'approved') return notApproved(answer)
      return context.records.create(resource, data).then((record) => JSON.stringify(record), refused)
    },
  })

/** Updates one record by its key once the user approves it, under the caller's access rules. */
export const updateRecordTool = (input: WriteRecordToolsInput = {}) =>
  defineTool({
    name: 'update_record',
    description: `Updates fields of one record of a resource by its key and returns it as JSON ({ record, etag }). Pass the etag get_record gave to fail when someone changed the record since. The user approves each write in their client first; nothing is written without it.${onlyNote(input)}`,
    parameters: {
      type: 'object',
      properties: {
        resource: resourceParameterFor(input),
        key: keyParameter,
        data: { ...dataParameter, description: 'The fields to change, names to new values, as list_resources gives the fields.' },
        etag: { type: 'string', description: 'The etag get_record gave, to fail when the record changed since.' },
      },
      required: ['resource', 'key', 'data'],
    },
    annotations: writes,
    run: async (args, context) => {
      const resource = resourceOf(args)
      const key = keyOf(args.key)
      const data = dataOf(args.data)
      if (!resource || key === undefined || !data) return 'Pass the resource, key and data as { "resource": "<name>", "key": "<key>", "data": { "<field>": <value> } }.'
      const refusal = outside(input, resource)
      if (refusal) return refusal
      const shownKey = Array.isArray(key) ? key.join(',') : String(key)
      const answer = await context.approve({ title: `Update ${resource} ${shownKey}?`, code: JSON.stringify(data, null, 2), approveLabel: 'Update' })
      if (answer !== 'approved') return notApproved(answer)
      const etag = typeof args.etag === 'string' && args.etag ? args.etag : undefined
      return context.records.update(resource, key, data, { etag }).then((record) => JSON.stringify(record), refused)
    },
  })

/** `create_record` and `update_record`, on the resources `input` allows. */
export const writeRecordTools = (input: WriteRecordToolsInput = {}) => [createRecordTool(input), updateRecordTool(input)]
