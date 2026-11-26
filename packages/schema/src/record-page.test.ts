import { describe, expect, it } from 'vitest'
import { f, resource } from './index'
import { recordText } from './record-page'
import { view } from './view'

const channels = resource('channels')
  .table('channels')
  .fields({ id: f.integer().readOnly(), name: f.text(), topic: f.text().optional(), member_ids: f.json().optional() })
  .primaryKey((r) => r.id)

const conversation = { resource: 'messages', field: 'channel_id', sender: 'author_id', time: 'sent_at', text: 'body' }

describe('view.record({ conversation })', () => {
  it('keeps the conversation as the record page', () => {
    const model = view<typeof channels>('channels').record({ conversation: { ...conversation, subtitle: 'topic' } }).toModel(channels.toModel())
    expect(model.record).toEqual({ conversation: { ...conversation, subtitle: 'topic' } })
    expect(model.titleFrom).toBeUndefined()
  })

  it("titles the record after its members, unless the view sets its own title rule", () => {
    const titled = view<typeof channels>('channels').record({ conversation: { ...conversation, members: 'member_ids' } })
    expect(titled.toModel(channels.toModel()).titleFrom).toEqual({ rule: 'members', fields: ['member_ids'] })
    expect(titled.titleFrom('own', (r) => [r.name]).toModel(channels.toModel()).titleFrom).toEqual({ rule: 'own', fields: ['name'] })
  })

  it('refuses a subtitle or members field the record does not have', () => {
    expect(() => view<typeof channels>('channels').record({ conversation: { ...conversation, subtitle: 'about' } }).toModel(channels.toModel())).toThrow('conversation subtitle names field "about"')
    expect(() => view<typeof channels>('channels').record({ conversation: { ...conversation, members: 'people' } }).toModel(channels.toModel())).toThrow('conversation members names field "people"')
  })

  it('refuses a placeholder or empty text that names a field the record does not have', () => {
    expect(() => view<typeof channels>('channels').record({ conversation: { ...conversation, placeholder: 'Message #{{title}}' } }).toModel(channels.toModel())).toThrow('conversation placeholder names field "title"')
    expect(() => view<typeof channels>('channels').record({ conversation: { ...conversation, empty: 'The start of {{name}} {{about}}' } }).toModel(channels.toModel())).toThrow('conversation empty names field "about"')
    expect(view<typeof channels>('channels').record({ conversation: { ...conversation, placeholder: 'Message #{{name}}', empty: 'Nothing yet' } }).toModel(channels.toModel()).record).toEqual({ conversation: { ...conversation, placeholder: 'Message #{{name}}', empty: 'Nothing yet' } })
  })
})

describe('recordText', () => {
  it('fills each {{field}} from the record, an empty one as empty text, and keeps a plain string', () => {
    expect(recordText('Message #{{name}}', { name: 'general' })).toBe('Message #general')
    expect(recordText('This is the start of #{{ name }}.', { name: null })).toBe('This is the start of #.')
    expect(recordText('Message the channel', { name: 'general' })).toBe('Message the channel')
  })
})
