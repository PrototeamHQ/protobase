import { describe, expect, it } from 'vitest'
import { f, resource } from '@protobase/schema'
import { migrationParts, type MigrationPart } from './parts'
import type { MigrationProject } from './migration-project'

const tickets = resource('tickets').table('tickets').fields({ id: f.integer(), title: f.text() }).primaryKey((r) => r.id)
const project = (models: MigrationProject['models']) => ({ models, views: [], db: {} as MigrationProject['db'], jobs: [], modules: {}, userTables: false, close: async () => {} }) satisfies MigrationProject
const names = (parts: MigrationPart[]) => parts.map((part) => part.name)

describe('the migration parts', () => {
  it("leave comments, webhooks, workflows, notifications, the relay's sessions and members, several processes, SQL's sends and the query role to the schema modules", () => {
    const realtime = { relay: { channels: {} }, processes: 'many', sqlSends: true } as MigrationProject['realtime']
    expect(names(migrationParts({ ...project([tickets.comments().toModel()]), webhooks: {}, workflows: {}, notifications: {}, auth: {} as NonNullable<MigrationProject['auth']>, realtime }))).toEqual([])
  })
  it('add the schemas of user tables, the delete of the definitions code owns only with userTables, the schemas being a module', () => {
    expect(names(migrationParts({ ...project([]), userTables: true }))).toEqual(['owned_definitions'])
    expect(names(migrationParts(project([])))).not.toContain('user_tables')
    expect(names(migrationParts(project([])))).not.toContain('owned_definitions')
  })
})
