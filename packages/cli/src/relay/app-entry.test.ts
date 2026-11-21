import { expect, test } from 'vitest'
import { relayAppEntry } from './app-entry'

const relay = { url: 'https://relay.example.com', app: 'chat', apiKey: 'a'.repeat(32), ticketKey: 't'.repeat(32), channels: { conversations: {} } }

test("the entry names the app, its keys and the origin of the app's URL", () => {
  expect(relayAppEntry(relay, 'https://chat.example.com/some/path')).toEqual({ id: 'chat', api_keys: ['a'.repeat(32)], ticket_keys: ['t'.repeat(32)], origins: ['https://chat.example.com'] })
})

test('without a URL the entry allows no browser origin', () => {
  expect(relayAppEntry(relay, undefined).origins).toEqual([])
})

test('with presence the entry names where the relay posts its reports, with their key', () => {
  const presence = { resource: 'presences', user: 'user_id', status: 'status', at: 'since', key: 'p'.repeat(32) }
  expect(relayAppEntry({ ...relay, presence }, 'https://chat.example.com/some/path').presence).toEqual({ url: 'https://chat.example.com/api/relay/presence', key: 'p'.repeat(32), grace_seconds: 30 })
  expect(relayAppEntry({ ...relay, presence }, 'https://chat.example.com', '/v2/rest').presence?.url).toBe('https://chat.example.com/v2/relay/presence')
  expect(() => relayAppEntry({ ...relay, presence }, undefined)).toThrow("realtime.relay.presence needs the app's url")
})
