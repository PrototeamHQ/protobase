import { describe, expect, it } from 'vitest'
import { f, resource } from '@protobase/schema'
import { migrationParts, type MigrationPart } from './parts'
import type { MigrationProject } from './load-project'

const tickets = resource('tickets').table('tickets').fields({ id: f.integer(), title: f.text() }).primaryKey((r) => r.id)
const project = (models: MigrationProject['models']) => ({ models, db: {} as MigrationProject['db'], jobs: [], close: async () => {} }) satisfies MigrationProject
const names = (parts: MigrationPart[]) => parts.map((part) => part.name)

describe('the migration parts', () => {
  it('add the jobs schema and the comments table once a resource takes comments', () => {
    expect(names(migrationParts(project([tickets.toModel()])))).toEqual(['changes'])
    expect(names(migrationParts(project([tickets.comments().toModel()])))).toEqual(['jobs', 'changes', 'comments'])
  })
})
