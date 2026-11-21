import type { BatchOp, BatchResult } from '@protobase/client'
import type { AttachmentsModel, ResourceModel } from '@protobase/schema'
import { keyValue } from '../create/create-values'
import type { Attachment } from './attachments'

const message = 'message'

/**
 * The one batch that sends a message of `resource` with `data`, its text and mentions among them, and its files: the
 * message first, then one attachment per upload `ticket`, each pointing at the message the batch creates.
 */
export const sendOps = (resource: string, data: Record<string, unknown>, attachments: AttachmentsModel, tickets: readonly string[]): BatchOp[] => [
  { op: 'create', resource, ref: message, data },
  ...tickets.map((ticket): BatchOp => ({ op: 'create', resource: attachments.resource, data: { [attachments.field]: { $ref: message }, [attachments.file]: ticket } })),
]

/** The message a `sendOps` batch created, its first result. */
export const sentMessage = (result: BatchResult) => {
  const first = result.results[0]
  if (first?.op !== 'create') throw new Error('A message batch starts with the message it creates')
  return first.record
}

/** The one batch that deletes the message keyed `key` of `page.resource` after its `files`, so none outlives it. */
export const deleteOps = (page: { resource: string; attachments?: AttachmentsModel }, model: ResourceModel, key: string, files: readonly Attachment[]): BatchOp[] => [
  ...(page.attachments ? files.map((file): BatchOp => ({ op: 'delete', resource: page.attachments!.resource, key: file.key })) : []),
  { op: 'delete', resource: page.resource, key: keyValue(model, key) },
]
