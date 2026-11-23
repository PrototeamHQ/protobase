import { describe, expect, it } from 'vitest'
import { f, resource } from '@protobase/schema'
import { appRelayChannels, defaultRelayChannels } from './realtime-channels'
import { chatRelay, conversationView, directsModel } from './testing/chat-models'

const models = [directsModel()]
const views = [conversationView('directs', { members: 'members' })]

describe('defaultRelayChannels', () => {
  it('derives a channel for each conversation page with members, that field as its members, and none for one without', () => {
    const typing = [conversationView('directs', { members: 'members', typing: true }), conversationView('rooms'), { resource: 'notes' } as never]
    expect(defaultRelayChannels({ views: typing, models })).toEqual({ directs: { members: { field: 'members' } } })
  })

  it('derives none for a resource whose changes are not captured, or whose key is not one field', () => {
    const quiet = resource('directs').table('directs').fields({ id: f.integer(), members: f.json() }).primaryKey((r) => r.id).toModel()
    expect(defaultRelayChannels({ views, models: [quiet] })).toEqual({})
    const paired = resource('directs').table('directs').fields({ a: f.integer(), b: f.integer(), members: f.json() }).primaryKey((r) => [r.a, r.b]).live().toModel()
    expect(defaultRelayChannels({ views, models: [paired] })).toEqual({})
    const sensitive = resource('directs').table('directs').fields({ id: f.integer(), members: f.json().sensitive() }).primaryKey((r) => r.id).live().toModel()
    expect(defaultRelayChannels({ views, models: [sensitive] })).toEqual({})
  })

  it('takes one members field of views of one resource, and stops on two', () => {
    expect(defaultRelayChannels({ views: [...views, conversationView('directs', { members: 'members' })], models })).toEqual({ directs: { members: { field: 'members' } } })
    const both = resource('directs').table('directs').fields({ id: f.integer(), members: f.json(), people: f.json() }).primaryKey((r) => r.id).live().toModel()
    expect(() => defaultRelayChannels({ views: [...views, conversationView('directs', { members: 'people' })], models: [both] })).toThrow('Views of "directs": their conversation pages list members in "members" and "people"')
  })
})

describe('appRelayChannels', () => {
  it("takes the config's channels, else the derived ones", () => {
    expect(appRelayChannels(chatRelay, { views, models, signIn: true })).toBe(chatRelay.channels)
    expect(appRelayChannels({}, { views, models, signIn: false })).toEqual({ directs: { members: { field: 'members' } } })
  })

  it('leaves an app without realtime.relay unable to move without sign-in or a derived channel', () => {
    expect(appRelayChannels(undefined, { views, models, signIn: true })).toEqual({ directs: { members: { field: 'members' } } })
    expect(appRelayChannels(undefined, { views, models, signIn: false })).toBeUndefined()
    expect(appRelayChannels(undefined, { views: [conversationView('directs')], models, signIn: true })).toBeUndefined()
  })
})
