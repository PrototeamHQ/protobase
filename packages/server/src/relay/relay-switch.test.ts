import { describe, expect, it } from 'vitest'
import { appRelaySettings, readRelaySwitch } from './relay-switch'
import { chatRelay } from './testing/chat-models'

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
  const { url, app, apiKey, ticketKey, ...ownOptions } = chatRelay
  const env = { PROTOBASE_REALTIME_URL: url, PROTOBASE_REALTIME_APP: app, PROTOBASE_REALTIME_API_KEY: apiKey, PROTOBASE_REALTIME_TICKET_KEY: ticketKey }

  it("leaves the relay off without the config's realtime.relay or the switch, the platform's address set or not", () => {
    expect(appRelaySettings(undefined, env)).toBeUndefined()
    expect(appRelaySettings(undefined, { ...env, PROTOBASE_REALTIME_ENABLED: 'false' })).toBeUndefined()
  })

  it("keeps a config's realtime.relay on whatever the switch says", () => {
    for (const PROTOBASE_REALTIME_ENABLED of [undefined, 'true', 'false']) expect(appRelaySettings(ownOptions, { ...env, PROTOBASE_REALTIME_ENABLED })).toEqual(chatRelay)
  })

  it('stops on the switch without realtime.relay, naming the switch', () => {
    expect(() => appRelaySettings(undefined, { ...env, PROTOBASE_REALTIME_ENABLED: 'true' })).toThrow('PROTOBASE_REALTIME_ENABLED is true, but the config has no realtime.relay')
  })

  it('refuses a switch that is neither true nor false, with realtime.relay too', () => {
    expect(() => appRelaySettings(ownOptions, { ...env, PROTOBASE_REALTIME_ENABLED: 'on' })).toThrow('PROTOBASE_REALTIME_ENABLED must be true or false, not "on"')
  })
})
