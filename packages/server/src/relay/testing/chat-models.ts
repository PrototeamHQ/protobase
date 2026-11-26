import { f, resource, type ViewModel } from '@protobase/schema'
import type { ResourceChange } from '../../changes/resource-change'
import type { RealtimeRelaySettings } from '../relay-options'

/** A chat's resources: conversations with members and messages, and open rooms with posts. */
export const chatModels = () => [
  resource('conversations').table('conversations').fields({ id: f.integer(), title: f.text() }).primaryKey((r) => r.id).live().toModel(),
  resource('conversation_members').table('conversation_members')
    .fields({ id: f.integer(), conversation_id: f.relation('conversations').filterable(), user_id: f.text().filterable(), deleted_at: f.timestamp().optional() })
    .primaryKey((r) => r.id)
    .softDelete((r) => r.deleted_at)
    .live()
    .toModel(),
  resource('messages').table('messages').fields({ id: f.integer(), conversation_id: f.relation('conversations').filterable(), body: f.text(), mentions: f.json().optional() }).primaryKey((r) => r.id).live().toModel(),
  resource('rooms').table('rooms').fields({ id: f.integer(), name: f.text() }).primaryKey((r) => r.id).live().toModel(),
  resource('posts').table('posts').fields({ id: f.integer(), room_id: f.relation('rooms').filterable(), body: f.text() }).primaryKey((r) => r.id).live().toModel(),
  resource('presences').table('presences').fields({ user_id: f.text(), status: f.enum(['online', 'away', 'offline']), since: f.timestamp() }).primaryKey((r) => r.user_id).live().toModel(),
  resource('notes').table('notes').fields({ id: f.integer(), conversation_id: f.relation('conversations').filterable() }).primaryKey((r) => r.id).toModel(),
]

export const chatRelay: RealtimeRelaySettings = {
  url: 'https://relay.example.com',
  app: 'chat',
  apiKey: 'k'.repeat(32),
  ticketKey: 't'.repeat(32),
  channels: {
    conversations: { members: { resource: 'conversation_members', channel: 'conversation_id', user: 'user_id' }, mentions: 'mentions' },
    rooms: {},
  },
}

/** The chat's presence, in its own `presences` resource. */
export const chatPresence = { resource: 'presences', user: 'user_id', status: 'status', at: 'since', key: 'p'.repeat(32) }

/** A conversation page on `resource`, its messages in `messages`, with members listed in `members` and typing when asked. */
export const conversationView = (resource: string, { members, typing }: { members?: string; typing?: true } = {}) =>
  ({ resource, record: { conversation: { resource: 'messages', field: 'conversation_id', sender: 'author_id', time: 'created_at', text: 'body', ...(members && { members }), ...(typing && { typing }) } } }) as unknown as ViewModel

/** A direct-message resource whose records list their members, as a conversation page's `members`. */
export const directsModel = () =>
  resource('directs').table('directs').fields({ id: f.integer(), members: f.json(), deleted_at: f.timestamp().optional() }).primaryKey((r) => r.id).softDelete((r) => r.deleted_at).live().toModel()

/** A workspace's channels: public ones, whose `member_ids` is null, reach its whole organization; private ones list theirs. */
export const workspaceChannelsModel = () =>
  resource('channels')
    .table('channels')
    .fields({ id: f.integer(), organization_id: f.text(), member_ids: f.json().optional(), deleted_at: f.timestamp().optional() })
    .primaryKey((r) => r.id)
    .tenant((r) => r.organization_id)
    .softDelete((r) => r.deleted_at)
    .live()
    .toModel()

let sequence = 0

/** A change as the dispatch hands it on. */
export const change = (resource: string, operation: ResourceChange['operation'], records: { before?: Record<string, unknown>; after?: Record<string, unknown> }): ResourceChange => ({
  resource,
  key: String((records.after ?? records.before)!.id),
  operation,
  ...records,
  changed: [],
  actor: null,
  source: 'api',
  databaseRole: null,
  transaction: '1',
  sequence: String(++sequence),
  at: '2026-11-21T00:00:00.000Z',
})
