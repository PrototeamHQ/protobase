import { describe, expect, it } from 'vitest'
import { f, resource } from '@protobase/schema'
import { relayModels } from './relay-models'
import { chatModels, chatPresence, chatRelay } from './testing/chat-models'

const withPresences = (presences: ReturnType<ReturnType<typeof resource>['toModel']>) => chatModels().map((model) => (model.name === 'presences' ? presences : model))

describe('presenceModel', () => {
  it('reads the presence resource and its fields', () => {
    const { presence } = relayModels({ ...chatRelay, presence: chatPresence }, chatModels())
    expect(presence).toMatchObject({ model: { name: 'presences' }, user: 'user_id', status: 'status', at: 'since' })
  })

  it('refuses a resource the app does not have', () => {
    expect(() => relayModels({ ...chatRelay, presence: { ...chatPresence, resource: 'statuses' } }, chatModels())).toThrow('realtime.relay.presence.resource: the app has no resource "statuses"')
  })

  it('refuses a resource whose changes are not captured', () => {
    const presences = resource('presences').table('presences').fields({ user_id: f.text(), status: f.text(), since: f.timestamp() }).primaryKey((r) => r.user_id).toModel()
    expect(() => relayModels({ ...chatRelay, presence: chatPresence }, withPresences(presences))).toThrow('declare .live() on it')
  })

  it('refuses a resource keyed by anything but its user field', () => {
    const presences = resource('presences').table('presences').fields({ id: f.integer(), user_id: f.text(), status: f.text(), since: f.timestamp() }).primaryKey((r) => r.id).live().toModel()
    expect(() => relayModels({ ...chatRelay, presence: chatPresence }, withPresences(presences))).toThrow('"presences" must be keyed by "user_id"')
  })

  it('refuses a status enum without the three statuses, and an at field that is no timestamp', () => {
    const enumOf = resource('presences').table('presences').fields({ user_id: f.text(), status: f.enum(['online', 'offline']), since: f.timestamp() }).primaryKey((r) => r.user_id).live().toModel()
    expect(() => relayModels({ ...chatRelay, presence: chatPresence }, withPresences(enumOf))).toThrow('must be text or an enum of online, away, offline')
    const dated = resource('presences').table('presences').fields({ user_id: f.text(), status: f.text(), since: f.date() }).primaryKey((r) => r.user_id).live().toModel()
    expect(() => relayModels({ ...chatRelay, presence: chatPresence }, withPresences(dated))).toThrow('"since" of "presences" must be a timestamp')
  })
})
