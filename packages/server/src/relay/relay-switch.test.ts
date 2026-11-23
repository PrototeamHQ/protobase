import { describe, expect, it } from 'vitest'
import type { ViewModel } from '@protobase/schema'
import { appRelaySettings, readRelaySwitch } from './relay-switch'
import { chatRelay, conversationView, directsModel } from './testing/chat-models'

describe('readRelaySwitch', () => {
  it('takes true and false, and is off when unset or empty', () => {
    expect(readRelaySwitch({ PROTOBASE_REALTIME_ENABLED: 'true' })).toBe(true)
    expect(readRelaySwitch({ PROTOBASE_REALTIME_ENABLED: 'false' })).toBe(false)
    expect(readRelaySwitch({})).toBe(false)
    expect(readRelaySwitch({ PROTOBASE_REALTIME_ENABLED: '' })).toBe(false)
  })

  it('refuses any other value, naming the variable and what it takes', () => {
    for (const value of ['1', 'on', 'yes', 'TRUE', ' true']) expect(() => readRelaySwitch({ PROTOBASE_REALTIME_ENABLED: value })).toThrow(`PROTOBASE_REALTIME_ENABLED must be true or false, not "${value}"`)
  })
})

describe('appRelaySettings', () => {
  const appOf = (views: ViewModel[]) => ({ views, models: [directsModel()], signIn: true })
  const { url, app, apiKey, ticketKey, ...ownOptions } = chatRelay
  const env = { PROTOBASE_REALTIME_URL: url, PROTOBASE_REALTIME_APP: app, PROTOBASE_REALTIME_API_KEY: apiKey, PROTOBASE_REALTIME_TICKET_KEY: ticketKey }

  it("leaves the relay off without the config's realtime.relay or the switch, the platform's address set or not", () => {
    expect(appRelaySettings(undefined, env, appOf([]))).toBeUndefined()
    expect(appRelaySettings(undefined, { ...env, PROTOBASE_REALTIME_ENABLED: 'false' }, appOf([conversationView('directs', { members: 'members' })]))).toBeUndefined()
  })

  it("keeps a config's realtime.relay on whatever the switch says", () => {
    for (const PROTOBASE_REALTIME_ENABLED of [undefined, 'true', 'false']) expect(appRelaySettings(ownOptions, { ...env, PROTOBASE_REALTIME_ENABLED }, appOf([]))).toEqual(chatRelay)
  })

  it('moves an app without realtime.relay on the switch, with the channels its conversation pages derive', () => {
    const views = [conversationView('directs', { members: 'members', typing: true })]
    expect(appRelaySettings(undefined, { ...env, PROTOBASE_REALTIME_ENABLED: 'true' }, appOf(views))).toEqual({ url, app, apiKey, ticketKey, channels: { directs: { members: { field: 'members' } } } })
  })

  it('derives the channels of a realtime.relay without them, as the switch does', () => {
    const views = [conversationView('directs', { members: 'members' })]
    expect(appRelaySettings({}, env, appOf(views))?.channels).toEqual({ directs: { members: { field: 'members' } } })
  })

  it('stops on the switch with no channels to derive, naming the switch', () => {
    const on = { ...env, PROTOBASE_REALTIME_ENABLED: 'true' }
    const stops = 'PROTOBASE_REALTIME_ENABLED is true, but the app has no realtime.relay, and no live conversation resource whose page has members, with sign-in'
    expect(() => appRelaySettings(undefined, on, appOf([conversationView('directs')]))).toThrow(stops)
    expect(() => appRelaySettings(undefined, on, { ...appOf([conversationView('directs', { members: 'members' })]), signIn: false })).toThrow(stops)
  })

  it('refuses a switch that is neither true nor false, with realtime.relay too', () => {
    expect(() => appRelaySettings(ownOptions, { ...env, PROTOBASE_REALTIME_ENABLED: 'on' }, appOf([]))).toThrow('PROTOBASE_REALTIME_ENABLED must be true or false, not "on"')
  })
})
