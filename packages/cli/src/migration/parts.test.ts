import { describe, expect, it } from 'vitest'
import { f, resource } from '@protobase/schema'
import type { DeviceStore, HistoryStore } from '@protobase/server'
import { migrationParts, type MigrationPart } from './parts'
import type { MigrationProject } from './load-project'

const tickets = resource('tickets').table('tickets').fields({ id: f.integer(), title: f.text() }).primaryKey((r) => r.id)
const project = (models: MigrationProject['models'], readOnlyQueries = false) => ({ models, db: {} as MigrationProject['db'], jobs: [], readOnlyQueries, authTables: { tables: [], schemas: [] }, close: async () => {} }) satisfies MigrationProject
const names = (parts: MigrationPart[]) => parts.map((part) => part.name)

describe('the migration parts', () => {
  it('add the jobs schema and the comments table once a resource takes comments', () => {
    expect(names(migrationParts(project([tickets.toModel()])))).toEqual(['changes', 'computed'])
    expect(names(migrationParts(project([tickets.comments().toModel()])))).toEqual(['jobs', 'changes', 'computed', 'comments'])
  })
  it('add the jobs schema once a resource has an AI field, which a job fills', () => {
    const summarised = resource('tickets').table('tickets').fields({ id: f.integer(), title: f.text(), summary: f.text().optional().ai({ prompt: 'Sum up {title}' }) }).primaryKey((r) => r.id)
    expect(names(migrationParts(project([summarised.toModel()])))).toEqual(['jobs', 'changes', 'computed'])
  })
  it("add the query role only with the built-in assistant's read-only queries", () => {
    expect(names(migrationParts(project([tickets.toModel()], true)))).toEqual(['changes', 'computed', 'query'])
  })
  it("add the jobs schema that sends notifications and the tables of notifications(), unless stores of the app's own keep both the devices and the history", () => {
    expect(names(migrationParts({ ...project([]), notifications: {} }))).toEqual(['jobs', 'changes', 'computed', 'notifications'])
    expect(names(migrationParts({ ...project([]), notifications: { store: {} as DeviceStore } }))).toEqual(['jobs', 'changes', 'computed', 'notifications'])
    expect(names(migrationParts({ ...project([]), notifications: { historyStore: {} as HistoryStore } }))).toEqual(['jobs', 'changes', 'computed', 'notifications'])
    expect(names(migrationParts({ ...project([]), notifications: { store: {} as DeviceStore, historyStore: {} as HistoryStore } }))).toEqual(['jobs', 'changes', 'computed'])
  })
})
