import { describe, expect, it } from 'vitest'
import { f, resource } from '@protobase/schema'
import { migrationParts, type MigrationPart } from './parts'
import type { MigrationProject } from './migration-project'

const tickets = resource('tickets').table('tickets').fields({ id: f.integer(), title: f.text() }).primaryKey((r) => r.id)
const project = (models: MigrationProject['models'], readOnlyQueries = false) => ({ models, views: [], db: {} as MigrationProject['db'], jobs: [], modules: {}, userTables: false, unsubscribe: false, mailFeedback: false, readOnlyQueries, authTables: { tables: [], schemas: [] }, close: async () => {} }) satisfies MigrationProject
const names = (parts: MigrationPart[]) => parts.map((part) => part.name)

describe('the migration parts', () => {
  it("leave webhooks, workflows, notifications, the relay's sessions and members, several processes and SQL's sends to the schema modules", () => {
    const realtime = { relay: { channels: {} }, processes: 'many', sqlSends: true } as MigrationProject['realtime']
    expect(names(migrationParts({ ...project([]), webhooks: {}, workflows: {}, notifications: {}, auth: {} as NonNullable<MigrationProject['auth']>, realtime }))).toEqual(['computed', 'derived'])
  })
  it('add the comments table once a resource takes comments', () => {
    expect(names(migrationParts(project([tickets.toModel()])))).toEqual(['computed', 'derived'])
    expect(names(migrationParts(project([tickets.comments().toModel()])))).toEqual(['computed', 'derived', 'comments'])
  })
  it("add the query role only with the built-in assistant's read-only queries", () => {
    expect(names(migrationParts(project([tickets.toModel()], true)))).toEqual(['computed', 'query', 'derived'])
  })
  it('add the unsubscribes table only with unsubscribe', () => {
    expect(names(migrationParts({ ...project([]), unsubscribe: true }))).toEqual(['computed', 'derived', 'unsubscribes'])
    expect(names(migrationParts(project([])))).not.toContain('unsubscribes')
  })
  it('add the feedback table, before the schema modules whose triggers capture its events, only with mailFeedback', () => {
    expect(names(migrationParts({ ...project([]), mailFeedback: true }))).toEqual(['mail_feedback', 'computed', 'derived'])
    expect(migrationParts({ ...project([]), mailFeedback: true })[0]!.beforeModules).toBe(true)
    expect(names(migrationParts(project([])))).not.toContain('mail_feedback')
  })
  it('add the schemas of user tables, then the delete of the definitions code owns, only with userTables', () => {
    expect(names(migrationParts({ ...project([]), userTables: true }))).toEqual(['computed', 'derived', 'user_tables', 'owned_definitions'])
    expect(names(migrationParts(project([])))).not.toContain('user_tables')
    expect(names(migrationParts(project([])))).not.toContain('owned_definitions')
  })
})
