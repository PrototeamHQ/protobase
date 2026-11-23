import { describe, expect, it } from 'vitest'
import { f, resource } from '@protobase/schema'
import type { DeviceStore, HistoryStore } from '@protobase/server'
import { migrationParts, type MigrationPart } from './parts'
import type { MigrationProject } from './load-project'

const tickets = resource('tickets').table('tickets').fields({ id: f.integer(), title: f.text() }).primaryKey((r) => r.id)
const project = (models: MigrationProject['models'], readOnlyQueries = false) => ({ models, views: [], db: {} as MigrationProject['db'], jobs: [], userTables: false, unsubscribe: false, mailFeedback: false, readOnlyQueries, authTables: { tables: [], schemas: [] }, close: async () => {} }) satisfies MigrationProject
const names = (parts: MigrationPart[]) => parts.map((part) => part.name)

describe('the migration parts', () => {
  it('add the jobs schema and the comments table once a resource takes comments', () => {
    expect(names(migrationParts(project([tickets.toModel()])))).toEqual(['changes', 'computed', 'derived'])
    expect(names(migrationParts(project([tickets.comments().toModel()])))).toEqual(['jobs', 'changes', 'computed', 'derived', 'comments'])
  })
  it('add the jobs schema once a resource has an AI field, which a job fills', () => {
    const summarised = resource('tickets').table('tickets').fields({ id: f.integer(), title: f.text(), summary: f.text().optional().ai({ prompt: 'Sum up {{title}}' }) }).primaryKey((r) => r.id)
    expect(names(migrationParts(project([summarised.toModel()])))).toEqual(['jobs', 'changes', 'computed', 'derived'])
  })
  it('add the jobs schema that dispatches the changes a live view reads', () => {
    const thread = resource('thread').table('thread').fields({ id: f.text() }).primaryKey((r) => r.id).live({ reads: ['tickets'] })
    expect(names(migrationParts(project([tickets.toModel(), thread.toModel()])))).toEqual(['jobs', 'changes', 'computed', 'derived'])
  })
  it('add the jobs schema once a resource is a time rollup, which a recurring job refreshes', () => {
    const readings = resource('readings').table('readings').fields({ id: f.bigint().readOnly(), taken_at: f.timestamp() }).primaryKey((r) => r.id)
    const hourly = resource('readings_hourly').table('readings_hourly').bucketsOf(readings, { time: (r) => r.taken_at, every: 'hour', by: () => [], late: '2 hours' })
    expect(names(migrationParts(project([readings.toModel(), hourly.toModel()])))).toEqual(['jobs', 'changes', 'computed', 'derived'])
  })
  it("add the query role only with the built-in assistant's read-only queries", () => {
    expect(names(migrationParts(project([tickets.toModel()], true)))).toEqual(['changes', 'computed', 'query', 'derived'])
  })
  it("add the jobs schema that sends notifications and the tables of notifications(), unless stores of the app's own keep both the devices and the history", () => {
    expect(names(migrationParts({ ...project([]), notifications: {} }))).toEqual(['jobs', 'changes', 'computed', 'derived', 'notifications'])
    expect(names(migrationParts({ ...project([]), notifications: { store: {} as DeviceStore } }))).toEqual(['jobs', 'changes', 'computed', 'derived', 'notifications'])
    expect(names(migrationParts({ ...project([]), notifications: { historyStore: {} as HistoryStore } }))).toEqual(['jobs', 'changes', 'computed', 'derived', 'notifications'])
    expect(names(migrationParts({ ...project([]), notifications: { store: {} as DeviceStore, historyStore: {} as HistoryStore } }))).toEqual(['jobs', 'changes', 'computed', 'derived'])
  })
  it("add the relay's part for an app the platform's switch can move, with sign-in and a live conversation resource whose page has members, as for realtime.relay", () => {
    const view = { resource: 'tickets', record: { conversation: { resource: 'messages', field: 'ticket_id', sender: 'author_id', time: 'created_at', text: 'body', members: 'members' } } } as unknown as MigrationProject['views'][number]
    const auth = {} as NonNullable<MigrationProject['auth']>
    const live = tickets.fields({ id: f.integer(), title: f.text(), members: f.json() }).live().toModel()
    expect(names(migrationParts({ ...project([live]), views: [view], auth }))).toEqual(['jobs', 'changes', 'computed', 'derived', 'relay'])
    expect(names(migrationParts({ ...project([live]), views: [view] }))).toEqual(['jobs', 'changes', 'computed', 'derived'])
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
  it('add the jobs schema and the feedback table, before the changes that capture its events, only with mailFeedback', () => {
    expect(names(migrationParts({ ...project([]), mailFeedback: true }))).toEqual(['jobs', 'mail_feedback', 'changes', 'computed', 'derived'])
    expect(names(migrationParts(project([])))).not.toContain('mail_feedback')
  })
  it('add the schemas of user tables, then the delete of the definitions code owns, only with userTables', () => {
    expect(names(migrationParts({ ...project([]), userTables: true }))).toEqual(['changes', 'computed', 'derived', 'user_tables', 'owned_definitions'])
    expect(names(migrationParts(project([])))).not.toContain('user_tables')
    expect(names(migrationParts(project([])))).not.toContain('owned_definitions')
  })
})
