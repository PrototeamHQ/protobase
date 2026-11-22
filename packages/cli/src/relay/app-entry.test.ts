import { expect, test } from 'vitest'
import type { ViewModel } from '@protobase/schema'
import { relayAppEntry } from './app-entry'

const relay = { url: 'https://relay.example.com', app: 'chat', apiKey: 'a'.repeat(32), ticketKey: 't'.repeat(32), channels: { conversations: {} } }
const typingPage = { resource: 'conversations', record: { conversation: { resource: 'messages', field: 'conversation_id', sender: 'author_id', time: 'created_at', text: 'body', typing: true } } } as unknown as ViewModel

test("the entry names the app, its keys and the origin of the app's URL", () => {
  expect(relayAppEntry(relay, { url: 'https://chat.example.com/some/path', views: [] })).toEqual({ id: 'chat', api_keys: ['a'.repeat(32)], ticket_keys: ['t'.repeat(32)], origins: ['https://chat.example.com'] })
})

test('without a URL the entry allows no browser origin', () => {
  expect(relayAppEntry(relay, { url: undefined, views: [] }).origins).toEqual([])
})

test('with presence the entry names where the relay posts its reports, with their key', () => {
  const presence = { resource: 'presences', user: 'user_id', status: 'status', at: 'since', key: 'p'.repeat(32) }
  expect(relayAppEntry({ ...relay, presence }, { url: 'https://chat.example.com/some/path', views: [] }).presence).toEqual({ url: 'https://chat.example.com/api/relay/presence', key: 'p'.repeat(32), grace_seconds: 30 })
  expect(relayAppEntry({ ...relay, presence }, { url: 'https://chat.example.com', apiPath: '/v2/rest', views: [] }).presence?.url).toBe('https://chat.example.com/v2/relay/presence')
  expect(() => relayAppEntry({ ...relay, presence }, { url: undefined, views: [] })).toThrow("realtime.relay.presence needs the app's url")
})

test("the entry declares each channel resource's events in the relay's field names", () => {
  const ring = { schema: { type: 'object' }, maxBytes: 512, perSecond: 0.5, burst: 1 }
  const entry = relayAppEntry({ ...relay, channels: { conversations: { events: { ring } }, rooms: {} } }, { url: undefined, views: [] })
  expect(entry.client_events).toEqual({ channels: { conversations: { events: { ring: { schema: { type: 'object' }, max_bytes: 512, per_second: 0.5, burst: 1 } } } } })
})

test("a typing conversation page declares typing on its resource's channels, and the resource's own typing wins", () => {
  const typing = relayAppEntry(relay, { url: undefined, views: [typingPage] }).client_events?.channels.conversations?.events.typing
  expect(typing).toMatchObject({ max_bytes: 256, per_second: 2, burst: 4, schema: { required: ['typing'] } })
  const own = { schema: { type: 'object' }, maxBytes: 64, perSecond: 1, burst: 1 }
  expect(relayAppEntry({ ...relay, channels: { conversations: { events: { typing: own } } } }, { url: undefined, views: [typingPage] }).client_events?.channels.conversations?.events.typing?.max_bytes).toBe(64)
})
