import { describe, expect, it } from 'vitest'
import { commentsTableSql } from './comments-sql'

describe('the comments table', () => {
  it('is made only where missing, with an index for each column the admin list filters on', () => {
    const text = commentsTableSql()
    expect(text).toContain('create table if not exists "comments"."comments"')
    expect(text).toContain('"mentions" jsonb not null')
    for (const columns of ['"resource", "record_key", "id"', '"tenant_id", "id"', '"author_id", "id"', '"created_at"']) expect(text).toContain(`("${columns.slice(1)})`)
    expect(text.match(/create index if not exists/g)).toHaveLength(4)
    expect(text).not.toMatch(/drop|default (false|0|'')/i)
  })
})
