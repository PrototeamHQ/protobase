import { describe, expect, it } from 'vitest'
import { f, resource } from '@protobase/schema'
import { relayModels } from './relay-models'
import { chatModels, chatRelay, directsModel, workspaceChannelsModel } from './testing/chat-models'

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

  it("places a channel resource's records on their own channel when its key is also a relation", () => {
    const profiles = resource('profiles').table('profiles').fields({ user_id: f.relation('conversations') }).primaryKey((r) => r.user_id).live().toModel()
    const models = relayModels({ ...chatRelay, channels: { ...chatRelay.channels, profiles: {} } }, [...chatModels(), profiles])
    expect(models.placements.get('profiles')).toEqual([
      { field: 'user_id', channel: 'profiles' },
      { field: 'user_id', channel: 'conversations' },
    ])
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

describe("relayModels of a channel whose records reach their organization when their members field is null", () => {
  it('keeps the tenant field the organization is read from', () => {
    const models = relayModels({ channels: { channels: { members: { field: 'member_ids', organization: 'when-null' } } } }, [workspaceChannelsModel()])
    expect(models.channels.get('channels')?.listed).toMatchObject({ field: 'member_ids', tenant: 'organization_id' })
  })

  it('refuses a resource without a tenant, whose records have no organization', () => {
    expect(() => relayModels({ channels: { directs: { members: { field: 'members', organization: 'when-null' } } } }, [directsModel()])).toThrow(
      'realtime.relay.channels.directs.members.organization: "directs" has no tenant field (.tenant), so a record has no organization to reach',
    )
  })

  it('reaches no organization without the option', () => {
    const models = relayModels({ channels: { channels: { members: { field: 'member_ids' } } } }, [workspaceChannelsModel()])
    expect(models.channels.get('channels')?.listed?.tenant).toBeUndefined()
  })
})

describe('relayModels of a channel whose records list their members', () => {
  it('takes a JSON field of a captured channel resource', () => {
    const models = relayModels({ channels: { directs: { members: { field: 'members' } } } }, [directsModel()])
    expect(models.channels.get('directs')?.listed).toMatchObject({ field: 'members' })
    expect(models.members.size).toBe(0)
  })

  it('refuses a field that is no JSON field, and a channel resource whose changes are not captured', () => {
    expect(() => relayModels({ channels: { directs: { members: { field: 'id' } } } }, [directsModel()])).toThrow('realtime.relay.channels.directs.members.field: "id" of "directs" is no JSON field of user ids')
    const quiet = resource('directs').table('directs').fields({ id: f.integer(), members: f.json() }).primaryKey((r) => r.id).toModel()
    expect(() => relayModels({ channels: { directs: { members: { field: 'members' } } } }, [quiet])).toThrow('the relay would not hear who joins or leaves: declare .live() on it')
  })

  it('refuses a members field whose changes capture leaves out: sensitive, or ignored by history', () => {
    const channels = { directs: { members: { field: 'members' } } }
    const sensitive = resource('directs').table('directs').fields({ id: f.integer(), members: f.json().sensitive() }).primaryKey((r) => r.id).live().toModel()
    expect(() => relayModels({ channels }, [sensitive])).toThrow('realtime.relay.channels.directs.members.field: "members" of "directs" is sensitive')
    const ignored = resource('directs').table('directs').fields({ id: f.integer(), members: f.json(), title: f.text() }).primaryKey((r) => r.id).live().history({ ignore: ['members'] }).toModel()
    expect(() => relayModels({ channels }, [ignored])).toThrow('"members" of "directs" is ignored by its history')
  })
})
