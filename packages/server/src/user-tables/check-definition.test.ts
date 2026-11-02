import { describe, expect, it } from 'vitest'
import { checkDefinition } from './check-definition'
import { column, field, notesColumns, notesDefinition } from './fixtures'

const problemOf = (result: ReturnType<typeof checkDefinition>) => ('problem' in result ? result.problem : undefined)

describe('checkDefinition', () => {
  it('passes a definition whose table and columns are there', () => {
    const result = checkDefinition(notesDefinition(), notesColumns())
    expect(problemOf(result)).toBeUndefined()
  })
  it.each([`notes"; drop table x; --`, 'Notes', '1notes', 'my notes', '_notes', 'n'.repeat(64), ''])('refuses the table name %j before any SQL is built from it', (name) => {
    const columns = notesColumns({ [name]: Object.fromEntries(notesColumns().get('notes')!) })
    expect(problemOf(checkDefinition(notesDefinition({ name }), columns))).toMatch(/its name is not lowercase letters/)
  })
  it.each([`title"; --`, 'Title', '9title', 'the title', 'é'])('refuses the field name %j', (name) => {
    expect(problemOf(checkDefinition(notesDefinition({ fields: [field({ name })], title_field: null }), notesColumns()))).toMatch(/the field name .* is not lowercase letters/)
  })
  it('refuses the field names the key and the record version take, and a field twice', () => {
    expect(problemOf(checkDefinition(notesDefinition({ fields: [field({ name: 'id' })], title_field: null }), notesColumns()))).toMatch('the field name "id" is reserved')
    expect(problemOf(checkDefinition(notesDefinition({ fields: [field({ name: 'etag' })], title_field: null }), notesColumns()))).toMatch('the field name "etag" is reserved')
    expect(problemOf(checkDefinition(notesDefinition({ fields: [field({ name: 'body' }), field({ name: 'body' })], title_field: null }), notesColumns()))).toMatch('the field "body" is defined twice')
  })
  it('refuses a type outside the eight, and a decimal without precision and scale', () => {
    expect(problemOf(checkDefinition(notesDefinition({ fields: [field({ name: 'body', type: 'uuid' })], title_field: null }), notesColumns()))).toMatch('has the type "uuid", which is not one of')
    const columns = notesColumns({ prices: { id: column('bigint', true, true), amount: column('numeric') } })
    expect(problemOf(checkDefinition(notesDefinition({ name: 'prices', fields: [field({ name: 'amount', type: 'decimal' })], title_field: null }), columns))).toMatch('has no precision and scale')
  })
  it('refuses a definition whose table, key or column is missing or of another type', () => {
    expect(problemOf(checkDefinition(notesDefinition({ name: 'tasks' }), notesColumns()))).toMatch('the table user_tables.tasks does not exist')
    expect(problemOf(checkDefinition(notesDefinition(), notesColumns({ notes: { id: column('integer', true, true), title: column('text', true) } })))).toMatch('has no "id" bigint primary key')
    expect(problemOf(checkDefinition(notesDefinition(), notesColumns({ notes: { id: column('bigint', true, false), title: column('text', true) } })))).toMatch('has no "id" bigint primary key')
    expect(problemOf(checkDefinition(notesDefinition({ fields: [field({ name: 'title', required: true }), field({ name: 'due' })] }), notesColumns()))).toMatch('the column "due" does not exist')
    expect(problemOf(checkDefinition(notesDefinition({ fields: [field({ name: 'body', type: 'integer' })], title_field: null }), notesColumns()))).toMatch('the column "body" is text, not what a integer field needs')
  })
  it('refuses an optional field over a NOT NULL column, which no create could leave out', () => {
    expect(problemOf(checkDefinition(notesDefinition({ fields: [field({ name: 'title', required: false })] }), notesColumns()))).toMatch('the optional field "title" has a NOT NULL column')
  })
  it('refuses a title that is not one of its text fields', () => {
    expect(problemOf(checkDefinition(notesDefinition({ title_field: 'missing' }), notesColumns()))).toMatch('its title "missing" is not one of its text fields')
  })
})
