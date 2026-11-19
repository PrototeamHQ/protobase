import { describe, expect, it } from 'vitest'
import { createsFunction, createsTable, createsTrigger, normalisedSql } from './migration-sql'

describe('the migration SQL doctor matches', () => {
  it('drops comments, folds unquoted identifiers to lower case and keeps quoted ones as written', () => {
    expect(normalisedSql('-- a note\nCREATE TABLE "Sales"."Orders" /* kept */ (\n  Id integer\n)')).toBe(' create table Sales.Orders ( id integer )')
  })

  it('finds a table created in its schema, or in public without one', () => {
    const sql = normalisedSql('create table if not exists notes (id integer); CREATE TABLE sales.orders (id integer)')
    expect(createsTable(sql, { name: 'notes' })).toBe(true)
    expect(createsTable(sql, { schema: 'public', name: 'notes' })).toBe(true)
    expect(createsTable(sql, { schema: 'sales', name: 'orders' })).toBe(true)
    expect(createsTable(sql, { name: 'orders' })).toBe(false)
    expect(createsTable(sql, { name: 'note' })).toBe(false)
  })

  it('finds a trigger by its name on its table, and a function in its schema', () => {
    const sql = normalisedSql('create trigger "notes_changes" after insert or delete on "notes" for each row execute function "changes"."capture"(\'notes\');\ncreate or replace function "changes"."capture"() returns trigger')
    expect(createsTrigger(sql, 'notes_changes', { name: 'notes' })).toBe(true)
    expect(createsTrigger(sql, 'notes_changes', { name: 'tasks' })).toBe(false)
    expect(createsTrigger(sql, 'notes_changes_update', { name: 'notes' })).toBe(false)
    expect(createsFunction(sql, 'changes', 'capture')).toBe(true)
    expect(createsFunction(sql, 'other', 'capture')).toBe(false)
  })
})
