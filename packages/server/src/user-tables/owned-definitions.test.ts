import { describe, expect, it } from 'vitest'
import { f, resource } from '@protobase/schema'
import { ownedTableNames, ownedDefinitionsMigration } from './owned-definitions'

const over = (name: string, table: string) => resource(name).table(table).fields({ id: f.bigint() }).primaryKey((r) => r.id).toModel()

describe('ownedTableNames', () => {
  it('names the user tables a resource in code reads with their own name, not one that only shares the name', () => {
    expect(ownedTableNames([over('notes', 'user_tables.notes'), over('tasks', 'public.tasks'), over('jobs', 'user_tables.other')])).toEqual(['notes'])
  })
})

describe('ownedDefinitionsMigration', () => {
  it('writes nothing, and reads nothing, when code owns no user table', async () => {
    expect(await ownedDefinitionsMigration(undefined as never, [over('tasks', 'tasks')])).toBeUndefined()
  })
})
