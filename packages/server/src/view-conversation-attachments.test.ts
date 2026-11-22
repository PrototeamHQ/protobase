import { describe, expect, it } from 'vitest'
import { f, resource } from '@protobase/schema'
import { attachmentsErrors, pruneAttachments } from './view-conversation-attachments'

const messages = resource('messages').table('messages').fields({ id: f.integer().readOnly().filterable(), body: f.text() }).primaryKey((r) => r.id).toModel()

const attachmentsModel = resource('attachments')
  .table('attachments')
  .fields({ id: f.integer().readOnly(), message_id: f.relation('messages').filterable(), file: f.file(), width: f.integer().optional(), height: f.integer().optional(), note: f.text() })
  .primaryKey((r) => r.id)
  .toModel()

const models = { messages, attachments: attachmentsModel }
const attachments = { resource: 'attachments', field: 'message_id', file: 'file', width: 'width', height: 'height' }

describe('attachmentsErrors', () => {
  it('takes a file resource pointing at the messages, with integer sizes', () => {
    expect(attachmentsErrors(attachments, 'messages', models)).toEqual([])
  })

  it('names a missing resource and fields of the wrong kind', () => {
    expect(attachmentsErrors({ ...attachments, resource: 'nope' }, 'messages', models)).toEqual(['unknown resource "nope"'])
    expect(attachmentsErrors({ ...attachments, field: 'id', file: 'note', width: 'note', height: 'missing' }, 'messages', models)).toEqual([
      'field: "id" on attachments is not filterable',
      'file: "note" is text; it holds the file itself, a file field',
      'width: "note" is text; an image\'s width is an integer field',
      'height: unknown field "missing" on attachments',
    ])
  })
})

describe('pruneAttachments', () => {
  it('keeps what the caller reads, and goes without the relation or the file', () => {
    expect(pruneAttachments(attachments, models)).toEqual(attachments)
    expect(pruneAttachments(attachments, { messages })).toBeUndefined()
    const { file: _, ...withoutFile } = attachmentsModel.fields
    expect(pruneAttachments(attachments, { messages, attachments: { ...attachmentsModel, fields: withoutFile } })).toBeUndefined()
    const { width: __, ...withoutWidth } = attachmentsModel.fields
    expect(pruneAttachments(attachments, { messages, attachments: { ...attachmentsModel, fields: withoutWidth } })).toEqual({ resource: 'attachments', field: 'message_id', file: 'file', height: 'height' })
  })
})
