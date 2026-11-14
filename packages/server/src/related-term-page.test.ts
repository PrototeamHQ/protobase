import { describe, expect, it } from 'vitest'
import { QueryError, relatedPage } from '@protobase/query'
import { f, resource, type RelatedFilter } from '@protobase/schema'
import { termPage } from './related-term-page'

const tasks = resource('tasks').table('tasks').fields({ id: f.integer().filterable().sortable(), created_at: f.timestamp().sortable() }).primaryKey((r) => r.id).toModel()
const span = { start: 3, end: 40 }
const term = (page: Partial<RelatedFilter>): RelatedFilter => ({ kind: 'related', field: { kind: 'field', path: ['task_id'], span }, resource: 'tasks', key: 'id', ...page, span })
const page = (request: Partial<RelatedFilter>) => termPage(tasks, term(request), undefined, {})

describe('termPage', () => {
  it('refuses a page token without a limit as the filter, at the term', () => {
    for (const request of [{ orderBy: 'created_at desc', pageToken: 'abc' }, { pageToken: 'abc' }]) {
      expect(() => page(request)).toThrow(expect.objectContaining({ status: 400, slug: 'invalid-filter', extras: expect.objectContaining({ errors: [expect.objectContaining({ code: 'invalid-arguments', span })] }) }))
    }
  })

  it('keeps each valid form as it was', () => {
    expect(page({})).toBeUndefined()
    expect(page({ orderBy: 'created_at desc' })).toEqual(relatedPage(tasks, { sort: [['created_at', 'desc']] }))
    expect(page({ orderBy: 'created_at desc', limit: 2 })).toEqual(relatedPage(tasks, { sort: [['created_at', 'desc']], limit: 2 }))
    // The token reaches the parent's page, which reads it as a list's: one from no list of it is refused as a cursor.
    expect(() => page({ orderBy: 'created_at desc', limit: 2, pageToken: 'abc' })).toThrow(QueryError)
  })
})
