import { describe, expect, it } from 'vitest'
import { f, resource } from '@protobase/schema'
import { deleteOps, sendOps, sentMessage } from './message-ops'

const messages = resource('messages').table('messages').fields({ id: f.integer().readOnly().filterable(), body: f.text() }).primaryKey((r) => r.id).toModel()
const attachments = { resource: 'attachments', field: 'message_id', file: 'file' }
const file = (key: number) => ({ key, name: 'a.png', type: 'image/png', size: 1, url: '/a.png', width: undefined, height: undefined })

describe('sendOps', () => {
  it('writes the message, then each file pointing at it, in one batch', () => {
    expect(sendOps('messages', { channel_id: 5 }, attachments, ['t-1', 't-2'])).toEqual([
      { op: 'create', resource: 'messages', ref: 'message', data: { channel_id: 5 } },
      { op: 'create', resource: 'attachments', data: { message_id: { $ref: 'message' }, file: 't-1' } },
      { op: 'create', resource: 'attachments', data: { message_id: { $ref: 'message' }, file: 't-2' } },
    ])
  })
})

describe('sentMessage', () => {
  it("is the message a send's batch created, its first result", () => {
    const message = { op: 'create' as const, resource: 'messages', ref: 'message', record: { id: 12 }, etag: 'a' }
    const file = { op: 'create' as const, resource: 'attachments', record: { id: 3 }, etag: 'b' }
    expect(sentMessage({ results: [message, file] })).toEqual({ id: 12 })
    expect(() => sentMessage({ results: [] })).toThrow('A message batch starts with the message it creates')
  })
})

describe('deleteOps', () => {
  it("deletes a message's files before the message", () => {
    expect(deleteOps({ resource: 'messages', attachments }, messages, '12', [file(3), file(4)])).toEqual([
      { op: 'delete', resource: 'attachments', key: 3 },
      { op: 'delete', resource: 'attachments', key: 4 },
      { op: 'delete', resource: 'messages', key: 12 },
    ])
  })
})
