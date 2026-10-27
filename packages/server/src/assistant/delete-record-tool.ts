/**
 * `delete_record`: deleting one record as the caller, through the REST API's delete path (its access rules, ETag check,
 * write hooks and soft delete), after the user approves it. Before asking it only reads: the resource's config and the
 * record the approval names, since MCP runs it again from the start with the user's answer.
 */
import { approvalTexts, recordBefore } from './record-before'
import type { RecordKeyInput } from './records'
import { keyOf, keyParameter, refused, resourceOf } from './record-tool-args'
import { defineTool } from './tools'
import { deleteApproval } from './write-prompts'
import { onlyNote, outside, resourceParameterFor, type WriteRecordToolsInput } from './write-tool-limits'

const parameterNames = ['resource', 'key', 'etag']

// Control, format (bidi and zero-width) and line separator characters, which could hide or reorder text in the prompt.
const hiddenCharacters = /[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/u

const keyPartOk = (part: string | number) => (typeof part === 'number' ? Number.isFinite(part) : part !== '' && !hiddenCharacters.test(part))

const deleteKeyOf = (value: unknown): RecordKeyInput | undefined => {
  const key = keyOf(value)
  if (key === undefined) return undefined
  return (Array.isArray(key) ? key : [key]).every(keyPartOk) ? key : undefined
}

// One quoted entity tag as get_record gives it: never `*`, a list, or a weak tag, which would match another version.
const etagOf = (value: unknown) => (typeof value === 'string' && /^"[\x21\x23-\x2b\x2d-\x7e]+"$/.test(value) ? value : undefined)

const usage = 'Pass only the resource, key and etag as { "resource": "<name>", "key": "<key>", "etag": "<the etag get_record gave>" }; nothing was deleted.'

/** Deletes one record by its key and ETag once the user approves it, under the caller's access rules. */
export const deleteRecordTool = (input: WriteRecordToolsInput = {}) =>
  defineTool({
    name: 'delete_record',
    description: `Deletes one record of a resource by its key. Pass the etag get_record gave: it fails when someone changed the record since. A resource that soft deletes keeps the record, deleted; any other loses it for good. The user approves each delete in their client first; nothing is deleted without it.${onlyNote(input)}`,
    parameters: {
      type: 'object',
      properties: {
        resource: resourceParameterFor(input),
        key: keyParameter,
        etag: { type: 'string', description: 'The etag get_record gave, to fail when the record changed since.' },
      },
      required: ['resource', 'key', 'etag'],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: false },
    run: async (args, context) => {
      const resource = resourceOf(args)
      const key = deleteKeyOf(args.key)
      const etag = etagOf(args.etag)
      if (!resource || key === undefined || !etag || Object.keys(args).some((name) => !parameterNames.includes(name))) return usage
      const refusal = outside(input, resource)
      if (refusal) return refusal
      const softDelete = await context.records.softDeleteField(resource).then((field) => ({ field }), refused)
      if (typeof softDelete === 'string') return softDelete
      const before = await recordBefore(context, resource, key, etag)
      if (typeof before === 'string') return before
      const { text, described } = await approvalTexts(context, resource)
      const answer = await context.approve(deleteApproval(text, described, key, before?.record ?? {}, softDelete.field !== undefined))
      if (answer !== 'approved') return `The user did not approve this delete (${answer}); nothing was deleted.`
      const deleted = () => JSON.stringify({ deleted: true, resource, key, restorable: softDelete.field !== undefined })
      return context.records.delete(resource, key, { etag }).then(deleted, refused)
    },
  })
