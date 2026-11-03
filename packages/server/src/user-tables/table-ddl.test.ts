import { describe, expect, it } from 'vitest'
import { compiled } from '../../../../test-support/compile-sql'
import { definitionFieldTypes } from './names'
import { createTableSql, fieldSql, indexKind, trigramIndexSql } from './table-ddl'

const text = (name: unknown, type: unknown = 'text', precision: unknown = null, scale: unknown = null) => ({ name, type, precision, scale })
const statements = (table: unknown, field = text('title')) => [createTableSql(table), ...fieldSql(table, field), trigramIndexSql(table, field.name)].map((built) => compiled(built))

const badNames = [`notes"; drop table x; --`, 'notes;', 'table_definitions.x', 'my notes', 'Notes', 'select', 'n'.repeat(64), '', 42, null]

describe('the statements of a table users add', () => {
  it('builds every statement in the user tables schema, each name quoted, with no parameters', () => {
    expect(statements('notes')).toEqual([
      { sql: 'create table "user_tables"."notes" (id bigint generated always as identity primary key)', parameters: [] },
      { sql: 'alter table "user_tables"."notes" add column "title" text', parameters: [] },
      { sql: 'create index on "user_tables"."notes" ("title")', parameters: [] },
      { sql: 'create index on "user_tables"."notes" using gin ("title" gin_trgm_ops)', parameters: [] },
    ])
  })
  it.each(badNames)('refuses the table name %j before any SQL is built', (name) => {
    expect(() => createTableSql(name)).toThrow(/cannot reach SQL/)
    expect(() => fieldSql(name, text('title'))).toThrow(/cannot reach SQL/)
  })
  it.each([...badNames, 'id', 'etag'])('refuses the field name %j before any SQL is built', (name) => {
    expect(() => fieldSql('notes', text(name))).toThrow(/cannot reach SQL/)
    expect(() => trigramIndexSql('notes', name)).toThrow(/cannot reach SQL/)
  })
  it('gives each type its column and index, and refuses any other type', () => {
    const columns = definitionFieldTypes.map((type) => [type, compiled(fieldSql('t', text('f', type, 10, 2))[0]!).sql.replace('alter table "user_tables"."t" add column "f" ', ''), indexKind(type)])
    expect(columns).toEqual([
      ['text', 'text', 'btree'],
      ['long_text', 'text', 'trigram'],
      ['integer', 'integer', 'btree'],
      ['decimal', 'numeric(10, 2)', 'btree'],
      ['boolean', 'boolean', 'btree'],
      ['date', 'date', 'btree'],
      ['timestamp', 'timestamptz', 'btree'],
      ['json', 'jsonb', undefined],
    ])
    expect(fieldSql('t', text('f', 'json'))).toHaveLength(1)
    expect(() => fieldSql('t', text('f', 'uuid'))).toThrow('has no index kind')
    expect(() => fieldSql('t', text('f', 'text); drop table x; --'))).toThrow('has no index kind')
    expect(() => indexKind('money')).toThrow('has no index kind')
  })
  it.each([[1.5, 0], [0, 0], [1001, 0], ['10', 2], [10, -1], [10, 11], [10, 0.5], [10, '2); drop table x; --']])('refuses the precision %j and scale %j', (precision, scale) => {
    expect(() => fieldSql('t', text('f', 'decimal', precision, scale))).toThrow(/is not a whole number/)
  })
})
