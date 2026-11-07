import { describe, expect, it } from 'vitest'
import { fieldsPositionIndexSql, schemasSql } from './schema-sql'

describe('schemasSql', () => {
  it("grants the app's role CREATE on the data schema only, and creates pg_trgm when missing", () => {
    const statements = schemasSql()
    expect(statements).toContain('create extension if not exists pg_trgm')
    expect(statements.filter((statement) => statement.startsWith('grant'))).toEqual(['grant usage, create on schema user_tables to current_user'])
    expect(statements).toContain('revoke create on schema table_definitions from public')
  })
})

describe('fieldsPositionIndexSql', () => {
  it('indexes the fields by table and position, also on a fields table made before it', () => {
    expect(fieldsPositionIndexSql()).toBe('create index if not exists fields_position_idx on table_definitions.fields (table_id, position)')
  })
})
