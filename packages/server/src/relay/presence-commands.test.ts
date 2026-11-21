import { describe, expect, it } from 'vitest'
import { presenceCommands, presencePeople } from './presence-commands'
import { relayModels } from './relay-models'
import { change, chatModels, chatPresence, chatRelay } from './testing/chat-models'

const models = relayModels({ ...chatRelay, presence: chatPresence }, chatModels())
const offline = change('presences', 'update', { before: { user_id: 'u1', status: 'online', since: '2026-11-21T10:00:00.000Z' }, after: { user_id: 'u1', status: 'offline', since: '2026-11-21T11:00:00.000Z' } })
const message = change('messages', 'create', { after: { id: 1, conversation_id: 7, body: 'Hi' } })

describe('presencePeople', () => {
  it('names the people whose presence a batch changes, each once', () => {
    expect(presencePeople(models, [offline, message, offline])).toEqual(['u1'])
  })

  it('names no one when the relay reports no presence', () => {
    expect(presencePeople(relayModels(chatRelay, chatModels()), [offline])).toEqual([])
  })
})

describe('presenceCommands', () => {
  it("publishes a person's new presence on people to those who share a channel with them", () => {
    expect(presenceCommands(models, [offline, message], new Map([['u1', ['u1', 'u2']]]))).toEqual([
      {
        kind: 'publish',
        id: `${offline.sequence}:people`,
        channel: 'people',
        users: ['u1', 'u2'],
        event: 'presence_changed',
        payload: { user: 'u1', status: 'offline', at: '2026-11-21T11:00:00.000Z' },
      },
    ])
  })

  it('publishes nothing for a person who shares no channel', () => {
    expect(presenceCommands(models, [offline], new Map())).toEqual([])
  })
})
