import { describe, expect, it } from 'vitest'
import { checkDefinition, type CheckedDefinition } from './check-definition'
import { definitionResource } from './definition-resource'
import { notesColumns, notesDefinition } from './fixtures'
import { servedUserTables } from './served-user-tables'

const built = (name: string) => {
  const result = checkDefinition(notesDefinition({ name }), notesColumns({ [name]: Object.fromEntries(notesColumns().get('notes')!) }))
  return definitionResource((result as { definition: CheckedDefinition }).definition)
}
const sources = (...names: string[]) => ({ resources: names.map((name) => built(name).resource), views: names.map((name) => built(name).view) })

describe('servedUserTables', () => {
  it('leaves out a user table whose name a resource of the app or a built-in one has, with a warning', () => {
    const served = servedUserTables(sources('notes', 'failed_jobs', 'tasks'), ['notes', 'failed_jobs'])
    expect(served.resources.map((source) => source.toModel().name)).toEqual(['tasks'])
    expect(served.views.map((view) => view.toModel().resource)).toEqual(['tasks'])
    expect(served.warnings).toEqual(['The user table "notes" is not served: a resource of the app has its name.', 'The user table "failed_jobs" is not served: a resource of the app has its name.'])
  })
  it('keeps the first of two user tables with one name', () => {
    const served = servedUserTables(sources('notes', 'notes'), [])
    expect(served.resources).toHaveLength(1)
    expect(served.views).toHaveLength(1)
    expect(served.warnings).toHaveLength(1)
  })
})
