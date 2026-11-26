import { describe, expect, it } from 'vitest'
import { f, resource, type ResourceModel } from '@protobase/schema'
import { conversationPageErrors, pruneConversationPage } from './view-conversation-page'

const channels = resource('channels')
  .table('channels')
  .fields({ id: f.integer().readOnly(), name: f.text(), topic: f.text().optional(), member_ids: f.json().optional(), open: f.boolean() })
  .primaryKey((r) => r.id)
  .toModel()

const messages = resource('messages')
  .table('messages')
  .fields({
    id: f.integer().readOnly().filterable().sortable(),
    channel_id: f.relation('channels').filterable(),
    author_id: f.text().readOnly(),
    body: f.text(),
    sent_at: f.timestamp().readOnly().sortable(),
    edited_at: f.timestamp().optional(),
    mentions: f.json(),
  })
  .primaryKey((r) => r.id)
  .author((r) => r.author_id)
  .toModel()

const positions = resource('read_positions')
  .table('read_positions')
  .fields({ id: f.integer().readOnly(), user_id: f.text().readOnly().filterable(), channel_id: f.relation('channels').filterable(), last_read_id: f.integer(), note: f.text() })
  .primaryKey((r) => r.id)
  .author((r) => r.user_id)
  .toModel()

const models = { channels, messages, read_positions: positions }

const readPosition = { resource: 'read_positions', field: 'channel_id', message: 'last_read_id' }
const page = { resource: 'messages', field: 'channel_id', sender: 'author_id', time: 'sent_at', text: 'body', edited: 'edited_at', mentions: 'mentions', subtitle: 'topic', members: 'member_ids', readPosition }

// A caller's models: the same, without the fields they may not read
const without = (model: ResourceModel, ...names: string[]): ResourceModel => ({ ...model, fields: Object.fromEntries(Object.entries(model.fields).filter(([name]) => !names.includes(name))) })

describe('conversationPageErrors', () => {
  it('takes a conversation of messages pointing at the record, with its read position', () => {
    expect(conversationPageErrors(page, 'channels', models)).toEqual([])
  })

  it('names fields of the wrong kind', () => {
    expect(conversationPageErrors({ ...page, edited: 'body', mentions: 'body', subtitle: 'open', members: 'name' }, 'channels', models)).toEqual([
      'edited: "body" is text; a message is marked edited by a date or timestamp field',
      'mentions: "body" is text; mentions are a JSON field of user ids',
      'subtitle: "open" is boolean; a subtitle is a text field',
      'members: "name" is text; members are a JSON field of user ids',
    ])
    expect(conversationPageErrors({ ...page, field: 'author_id' }, 'channels', models)).toEqual(['field: "author_id" on messages is not filterable'])
    expect(conversationPageErrors({ ...page, resource: 'nope' }, 'channels', models)).toEqual(['unknown resource "nope"'])
  })

  it('refuses a placeholder or empty text that names a field the record does not have', () => {
    expect(conversationPageErrors({ ...page, placeholder: 'Message #{{name}}', empty: 'The start of #{{name}}' }, 'channels', models)).toEqual([])
    expect(conversationPageErrors({ ...page, placeholder: 'Message #{{title}}', empty: '{{name}} {{body}}' }, 'channels', models)).toEqual([
      'placeholder: names field "title", which channels does not have',
      'empty: names field "body", which channels does not have',
    ])
  })

  it("needs a read position kept per reader, of a message's integer key", () => {
    expect(conversationPageErrors({ ...page, readPosition: { ...readPosition, message: 'note' } }, 'channels', models)).toEqual(['readPosition: message: "note" is text; it holds a message\'s key, an integer'])
    expect(conversationPageErrors(page, 'channels', { ...models, read_positions: { ...positions, author: undefined } })).toEqual(["readPosition: read_positions has no .author(), so it cannot keep each reader's own position"])
    expect(conversationPageErrors(page, 'channels', { ...models, messages: { ...messages, primaryKey: ['body'] } })).toEqual(['readPosition: messages needs a key of one integer column, which grows as messages arrive'])
  })

  it('finds the reader\'s own position by a filterable author', () => {
    const user_id = { ...positions.fields.user_id!, filterable: false }
    expect(conversationPageErrors(page, 'channels', { ...models, read_positions: { ...positions, fields: { ...positions.fields, user_id } } })).toEqual([
      'readPosition: "user_id" on read_positions is not filterable, so a reader\'s own position cannot be found',
    ])
  })

  it('sends the record and the message it was read to, so neither is read-only', () => {
    const channel_id = { ...positions.fields.channel_id!, readOnly: true }
    const last_read_id = { ...positions.fields.last_read_id!, readOnly: true }
    expect(conversationPageErrors(page, 'channels', { ...models, read_positions: { ...positions, fields: { ...positions.fields, channel_id, last_read_id } } })).toEqual([
      'readPosition: field: "channel_id" is read-only on read_positions',
      'readPosition: message: "last_read_id" is read-only on read_positions',
    ])
    expect(conversationPageErrors(page, 'channels', { ...models, read_positions: { ...positions, tenant: 'last_read_id' } })).toEqual(['readPosition: message: "last_read_id" is read-only on read_positions'])
  })
})

describe('pruneConversationPage', () => {
  it('keeps the whole page for a caller who reads everything', () => {
    expect(pruneConversationPage(page, 'channels', models)).toEqual(page)
  })

  it('is gone for a caller who cannot read the messages or a field each one needs, so the standard page shows', () => {
    expect(pruneConversationPage(page, 'channels', { channels, read_positions: positions })).toBeUndefined()
    expect(pruneConversationPage(page, 'channels', { ...models, messages: without(messages, 'body') })).toBeUndefined()
  })

  it('leaves out what the caller cannot read', () => {
    const pruned = pruneConversationPage(page, 'channels', { channels: without(channels, 'topic'), messages: without(messages, 'edited_at', 'mentions'), read_positions: without(positions, 'user_id') })
    expect(pruned).toEqual({ resource: 'messages', field: 'channel_id', sender: 'author_id', time: 'sent_at', text: 'body', members: 'member_ids' })
  })

  it('keeps the call for every reader: its function decides who joins', () => {
    const pruned = pruneConversationPage({ ...page, call: 'call' }, 'channels', { ...models, messages: without(messages, 'edited_at') })
    expect(pruned).toMatchObject({ call: 'call' })
  })

  it('is gone for a caller who cannot read a thread field, so replies never show among the messages', () => {
    const threaded = { ...messages, fields: { ...messages.fields, thread_id: { ...messages.fields.channel_id!, relation: { resource: 'messages', columns: ['thread_id'] } }, reply_count: messages.fields.id! } }
    const options = { ...page, thread: { field: 'thread_id', count: 'reply_count', last: 'sent_at' } }
    expect(pruneConversationPage(options, 'channels', { ...models, messages: threaded })).toEqual(options)
    expect(pruneConversationPage(options, 'channels', { ...models, messages: without(threaded, 'reply_count') })).toBeUndefined()
  })

  it('leaves out a conditional delete for a caller who cannot read its fields, and keeps edit and threads', () => {
    const options = { ...page, edit: true, delete: { unless: 'edited_at:*' }, thread: { field: 'channel_id', count: 'id', last: 'sent_at' } }
    expect(pruneConversationPage(options, 'channels', models)).toEqual(options)
    const pruned = pruneConversationPage(options, 'channels', { ...models, messages: without(messages, 'edited_at') })
    expect(pruned).toMatchObject({ edit: true, thread: options.thread })
    expect(pruned).not.toHaveProperty('delete')
  })
})
