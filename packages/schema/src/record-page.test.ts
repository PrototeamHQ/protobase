import { describe, expect, it } from 'vitest'
import { f, resource } from './index'
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
})
