import { describe, expect, it } from 'vitest'
import { f, resource } from '@protobase/schema'
import { relayModels } from './relay-models'
import { chatModels, chatRelay } from './testing/chat-models'

describe('relayModels', () => {
  it("places captured records on their channel resource's channels, by its own key and by relations to it", () => {
    const models = relayModels(chatRelay, chatModels())
    expect(Object.fromEntries(models.placements)).toEqual({
      conversations: [{ field: 'id', channel: 'conversations' }],
      conversation_members: [{ field: 'conversation_id', channel: 'conversations' }],
      messages: [{ field: 'conversation_id', channel: 'conversations' }],
      rooms: [{ field: 'id', channel: 'rooms' }],
      posts: [{ field: 'room_id', channel: 'rooms' }],
    })
    expect(models.members.get('conversation_members')).toMatchObject([{ channel: 'conversations', field: 'conversation_id', user: 'user_id' }])
    expect(models.channels.get('rooms')).toEqual({})
  })

  it('refuses a channel resource the app does not have', () => {
    expect(() => relayModels({ ...chatRelay, channels: { threads: {} } }, chatModels())).toThrow('realtime.relay.channels.threads: the app has no resource "threads"')
  })

  it('refuses members whose channel field is no relation to the channel resource', () => {
    const channels = { conversations: { members: { resource: 'conversation_members', channel: 'user_id', user: 'user_id' } } }
    expect(() => relayModels({ ...chatRelay, channels }, chatModels())).toThrow('"user_id" of "conversation_members" is no relation to "conversations"')
  })

  it('refuses a members resource whose changes are not captured', () => {
    const members = resource('conversation_members').table('conversation_members').fields({ id: f.integer(), conversation_id: f.relation('conversations').filterable(), user_id: f.text() }).primaryKey((r) => r.id).toModel()
    const models = chatModels().map((model) => (model.name === 'conversation_members' ? members : model))
    expect(() => relayModels(chatRelay, models)).toThrow('declare .live() on it')
  })

  it('refuses a mentions field no noticed resource has', () => {
    const channels = { conversations: { ...chatRelay.channels.conversations!, mentions: 'tagged' } }
    expect(() => relayModels({ ...chatRelay, channels }, chatModels())).toThrow('no captured resource noticed on the channel has a field "tagged"')
  })
})
