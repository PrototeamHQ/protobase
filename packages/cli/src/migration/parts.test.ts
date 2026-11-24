import { describe, expect, it } from 'vitest'
import { f, resource } from '@protobase/schema'
import type { DeviceStore, HistoryStore } from '@protobase/server'
import { migrationParts, type MigrationPart } from './parts'
import type { MigrationProject } from './migration-project'

const tickets = resource('tickets').table('tickets').fields({ id: f.integer(), title: f.text() }).primaryKey((r) => r.id)
const project = (models: MigrationProject['models'], readOnlyQueries = false) => ({ models, views: [], db: {} as MigrationProject['db'], jobs: [], modules: [], userTables: false, unsubscribe: false, mailFeedback: false, readOnlyQueries, authTables: { tables: [], schemas: [] }, close: async () => {} }) satisfies MigrationProject
const names = (parts: MigrationPart[]) => parts.map((part) => part.name)

describe('the migration parts', () => {
  it('add the comments table once a resource takes comments', () => {
    expect(names(migrationParts(project([tickets.toModel()])))).toEqual(['changes', 'computed', 'derived'])
    expect(names(migrationParts(project([tickets.comments().toModel()])))).toEqual(['changes', 'computed', 'derived', 'comments'])
  })
  it("add the query role only with the built-in assistant's read-only queries", () => {
    expect(names(migrationParts(project([tickets.toModel()], true)))).toEqual(['changes', 'computed', 'query', 'derived'])
  })
  it("add the tables of notifications(), unless stores of the app's own keep both the devices and the history", () => {
    expect(names(migrationParts({ ...project([]), notifications: {} }))).toEqual(['changes', 'computed', 'derived', 'notifications'])
    expect(names(migrationParts({ ...project([]), notifications: { store: {} as DeviceStore } }))).toEqual(['changes', 'computed', 'derived', 'notifications'])
    expect(names(migrationParts({ ...project([]), notifications: { historyStore: {} as HistoryStore } }))).toEqual(['changes', 'computed', 'derived', 'notifications'])
    expect(names(migrationParts({ ...project([]), notifications: { store: {} as DeviceStore, historyStore: {} as HistoryStore } }))).toEqual(['changes', 'computed', 'derived'])
  })
  it("add the relay's part for an app the platform's switch can move, with sign-in and a live conversation resource whose page has members, as for realtime.relay", () => {
    const view = { resource: 'tickets', record: { conversation: { resource: 'messages', field: 'ticket_id', sender: 'author_id', time: 'created_at', text: 'body', members: 'members' } } } as unknown as MigrationProject['views'][number]
    const auth = {} as NonNullable<MigrationProject['auth']>
    const live = tickets.fields({ id: f.integer(), title: f.text(), members: f.json() }).live().toModel()
    expect(names(migrationParts({ ...project([live]), views: [view], auth }))).toEqual(['changes', 'computed', 'derived', 'relay'])
    expect(names(migrationParts({ ...project([live]), views: [view] }))).toEqual(['changes', 'computed', 'derived'])
    expect(names(migrationParts({ ...project([tickets.fields({ id: f.integer(), members: f.json() }).toModel()]), views: [view], auth }))).toEqual(['changes', 'computed', 'derived'])
  })
  it('add the relay with several processes, and the sends of SQL to the channels once turned on', () => {
    expect(names(migrationParts({ ...project([]), realtime: { processes: 'many', sqlSends: true } }))).toEqual(['changes', 'computed', 'derived', 'realtime_relay', 'channel_sends'])
    expect(names(migrationParts({ ...project([]), realtime: { sqlSends: false } }))).toEqual(['changes', 'computed', 'derived'])
  })
  it('add the statuses table only with status', () => {
    expect(names(migrationParts({ ...project([]), status: {} }))).toEqual(['changes', 'computed', 'derived', 'status'])
    expect(names(migrationParts(project([])))).not.toContain('status')
  })
  it('add the unsubscribes table only with unsubscribe', () => {
    expect(names(migrationParts({ ...project([]), unsubscribe: true }))).toEqual(['changes', 'computed', 'derived', 'unsubscribes'])
    expect(names(migrationParts(project([])))).not.toContain('unsubscribes')
  })
  it('add the feedback table, before the changes that capture its events, only with mailFeedback', () => {
    expect(names(migrationParts({ ...project([]), mailFeedback: true }))).toEqual(['mail_feedback', 'changes', 'computed', 'derived'])
    expect(names(migrationParts(project([])))).not.toContain('mail_feedback')
  })
  it('add the schemas of user tables, then the delete of the definitions code owns, only with userTables', () => {
    expect(names(migrationParts({ ...project([]), userTables: true }))).toEqual(['changes', 'computed', 'derived', 'user_tables', 'owned_definitions'])
    expect(names(migrationParts(project([])))).not.toContain('user_tables')
    expect(names(migrationParts(project([])))).not.toContain('owned_definitions')
  })
})
