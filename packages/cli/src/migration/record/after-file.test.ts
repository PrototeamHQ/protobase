import { describe, expect, it } from 'vitest'
import { afterFileOf, afterStatements, builtIndex } from './after-file'

describe('afterStatements', () => {
  it('splits at a semicolon that ends a line, dropping comment lines', () => {
    const text = '-- Indexes.\r\ncreate index concurrently if not exists a_idx\n  on a (x);\n\n-- Then the unique one.\ncreate unique index concurrently b_key on b (y);'
    expect(afterStatements(text)).toEqual(['create index concurrently if not exists a_idx\n  on a (x)', 'create unique index concurrently b_key on b (y)'])
  })
})

describe('builtIndex', () => {
  it('names the index a statement builds concurrently, as Postgres names it, and whether it is unique', () => {
    expect(builtIndex('create index concurrently if not exists A_idx on a (x)')).toEqual({ index: 'a_idx', unique: false })
    expect(builtIndex('CREATE UNIQUE INDEX CONCURRENTLY "B Key" ON b (y)')).toEqual({ index: 'B Key', unique: true })
    expect(builtIndex('analyze a')).toBeUndefined()
  })
})

describe('afterFileOf', () => {
  it('is the migration with .after.sql for .sql', () => {
    expect(afterFileOf('007_indexes.sql')).toBe('007_indexes.after.sql')
  })
})
