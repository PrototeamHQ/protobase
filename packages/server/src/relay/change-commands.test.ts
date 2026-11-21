import { describe, expect, it } from 'vitest'
import { f, resource } from '@protobase/schema'
import { audienceChannels, changeCommands, noticedChannels } from './change-commands'
import { relayModels } from './relay-models'
import { change, chatModels, chatRelay } from './testing/chat-models'

const models = relayModels(chatRelay, chatModels())
const roomMembers = resource('room_members').table('room_members')
  .fields({ id: f.integer(), room_id: f.relation('rooms').filterable(), conversation_id: f.relation('conversations').filterable(), user_id: f.text() })
  .primaryKey((r) => r.id)
  .live()
  .toModel()
const members = new Map([['conversations/7', ['u1', 'u2']]])

describe('changeCommands', () => {
  it("notices a message on its conversation to the conversation's members, with its mentions", () => {
    const message = change('messages', 'create', { after: { id: 42, conversation_id: 7, body: 'Hi @u2', mentions: ['u2'] } })
    expect(changeCommands(models, [message], members)).toEqual([
      {
        kind: 'publish',
        id: `${message.sequence}:conversations/7`,
        channel: 'conversations/7',
        users: ['u1', 'u2'],
        event: 'change',
        payload: { kind: 'create', resource: 'messages', key: '42', channel: 'conversations/7', mentions: ['u2'] },
      },
    ])
  })

  it('notices a record of an open channel to everyone joined to it', () => {
    const post = change('posts', 'update', { before: { id: 3, room_id: 1, body: 'a' }, after: { id: 3, room_id: 1, body: 'b' } })
    expect(changeCommands(models, [post], members)).toEqual([{ kind: 'publish', id: `${post.sequence}:rooms/1`, channel: 'rooms/1', event: 'change', payload: { kind: 'update', resource: 'posts', key: '3', channel: 'rooms/1' } }])
  })

  it('adds a new member to the channel before the notice, which reaches them too', () => {
    const joined = change('conversation_members', 'create', { after: { id: 1, conversation_id: 7, user_id: 'u3' } })
    const [add, notice] = changeCommands(models, [joined], members)
    expect(add).toEqual({ kind: 'add', channel: 'conversations/7', users: ['u3'] })
    expect(notice).toMatchObject({ kind: 'publish', channel: 'conversations/7', users: ['u1', 'u2', 'u3'] })
  })

  it('removes a member after the notice of their leaving, which reaches them too', () => {
    const left = change('conversation_members', 'delete', { before: { id: 1, conversation_id: 7, user_id: 'u3' } })
    const commands = changeCommands(models, [left], members)
    expect(commands.map((command) => command.kind)).toEqual(['publish', 'remove'])
    expect(commands[0]).toMatchObject({ users: ['u1', 'u2', 'u3'] })
    expect(commands[1]).toEqual({ kind: 'remove', channel: 'conversations/7', users: ['u3'] })
  })

  it('takes a soft-deleted member out and an undeleted one back in', () => {
    const deleted = change('conversation_members', 'delete', { before: { id: 1, conversation_id: 7, user_id: 'u3', deleted_at: null }, after: { id: 1, conversation_id: 7, user_id: 'u3', deleted_at: '2026-11-21T00:00:00Z' } })
    const undeleted = change('conversation_members', 'undelete', { before: { id: 1, conversation_id: 7, user_id: 'u3', deleted_at: '2026-11-21T00:00:00Z' }, after: { id: 1, conversation_id: 7, user_id: 'u3', deleted_at: null } })
    expect(changeCommands(models, [deleted], members).filter((command) => command.kind !== 'publish')).toEqual([{ kind: 'remove', channel: 'conversations/7', users: ['u3'] }])
    expect(changeCommands(models, [undeleted], members).filter((command) => command.kind !== 'publish')).toEqual([{ kind: 'add', channel: 'conversations/7', users: ['u3'] }])
  })

  it('moves a member whose record moved to another conversation', () => {
    const moved = change('conversation_members', 'update', { before: { id: 1, conversation_id: 7, user_id: 'u3' }, after: { id: 1, conversation_id: 8, user_id: 'u3' } })
    const commands = changeCommands(models, [moved], members).filter((command) => command.kind !== 'publish')
    expect(commands).toEqual([
      { kind: 'add', channel: 'conversations/8', users: ['u3'] },
      { kind: 'remove', channel: 'conversations/7', users: ['u3'] },
    ])
  })

  it('notices a member who moved and changed person only to the person on each side', () => {
    const moved = change('conversation_members', 'update', { before: { id: 1, conversation_id: 7, user_id: 'u3' }, after: { id: 1, conversation_id: 8, user_id: 'u4' } })
    const notices = changeCommands(models, [moved], members).filter((command) => command.kind === 'publish')
    expect(notices).toMatchObject([
      { channel: 'conversations/7', users: ['u1', 'u2', 'u3'] },
      { channel: 'conversations/8', users: ['u4'] },
    ])
  })

  it('puts nobody in a channel with a member record created already soft-deleted', () => {
    const created = change('conversation_members', 'create', { after: { id: 1, conversation_id: 7, user_id: 'u3', deleted_at: '2026-11-21T00:00:00Z' } })
    const commands = changeCommands(models, [created], members)
    expect(commands.filter((command) => command.kind !== 'publish')).toEqual([])
    expect(commands[0]).toMatchObject({ kind: 'publish', users: ['u1', 'u2'] })
  })

  it('keeps every channel resource a members resource fills current', () => {
    const relay = { ...chatRelay, channels: { ...chatRelay.channels, rooms: { members: { resource: 'room_members', channel: 'room_id', user: 'user_id' } }, conversations: { members: { resource: 'room_members', channel: 'conversation_id', user: 'user_id' } } } }
    const both = relayModels(relay, [...chatModels(), roomMembers])
    const joined = change('room_members', 'create', { after: { id: 1, room_id: 1, conversation_id: 7, user_id: 'u3' } })
    expect(changeCommands(both, [joined], members).filter((command) => command.kind !== 'publish')).toEqual([
      { kind: 'add', channel: 'conversations/7', users: ['u3'] },
      { kind: 'add', channel: 'rooms/1', users: ['u3'] },
    ])
  })

  it('leaves out the notice of a channel with members that has none', () => {
    const message = change('messages', 'create', { after: { id: 1, conversation_id: 99, body: 'x' } })
    expect(changeCommands(models, [message], members)).toEqual([])
  })

  it('notices nothing of a resource that is on no channel', () => {
    expect(changeCommands(models, [change('notes', 'create', { after: { id: 1, conversation_id: 7 } })], members)).toEqual([])
  })
})

describe('noticedChannels', () => {
  it('notices a record that moved on the channel it left and the one it joined', () => {
    const moved = change('messages', 'update', { before: { id: 1, conversation_id: 7 }, after: { id: 1, conversation_id: 8 } })
    expect(noticedChannels(models, moved)).toEqual(['conversations/7', 'conversations/8'])
  })
})

describe('audienceChannels', () => {
  it('names each channel with members a batch notices once, and no open one', () => {
    const changes = [change('messages', 'create', { after: { id: 1, conversation_id: 7 } }), change('messages', 'create', { after: { id: 2, conversation_id: 7 } }), change('posts', 'create', { after: { id: 1, room_id: 1 } })]
    expect(audienceChannels(models, changes)).toEqual(['conversations/7'])
  })
})
