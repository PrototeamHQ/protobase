import { expect, test } from 'vitest'
import { relayAppEntry } from './app-entry'

const relay = { url: 'https://relay.example.com', app: 'chat', apiKey: 'a'.repeat(32), ticketKey: 't'.repeat(32), channels: { conversations: {} } }

test("the entry names the app, its keys and the origin of the app's URL", () => {
  expect(relayAppEntry(relay, 'https://chat.example.com/some/path')).toEqual({ id: 'chat', api_keys: ['a'.repeat(32)], ticket_keys: ['t'.repeat(32)], origins: ['https://chat.example.com'] })
})

test('without a URL the entry allows no browser origin', () => {
  expect(relayAppEntry(relay, undefined).origins).toEqual([])
})
