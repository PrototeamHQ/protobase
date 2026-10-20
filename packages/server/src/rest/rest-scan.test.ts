import { describe, expect, it } from 'vitest'
import type { TableIndexes } from '@protobase/query'
import { parseFilter } from './parse-filter'
import { parseOrder } from './parse-order'
import { scanRefusal, uncoveredReads } from './rest-scan'

const key = (column: string | null, opclass = 'int4_ops', definition = column ?? '') => ({ column, definition, opclass })

const todos: TableIndexes = {
  kind: 'table',
  indexes: [
    { name: 'todos_pkey', method: 'btree', partial: false, keys: [key('id')] },
    { name: 'todos_user_id_id_idx', method: 'btree', partial: false, keys: [key('user_id', 'uuid_ops'), key('id')] },
    { name: 'todos_title_idx', method: 'gin', partial: false, keys: [key('title', 'gin_trgm_ops')] },
    { name: 'todos_tags_idx', method: 'gin', partial: false, keys: [key('tags', 'array_ops')] },
    { name: 'todos_during_idx', method: 'gist', partial: false, keys: [key('during', 'range_ops')] },
    { name: 'todos_kind_idx', method: 'btree', partial: false, keys: [key(null, 'text_ops', "(meta ->> 'kind'::text)")] },
    { name: 'todos_open_idx', method: 'btree', partial: true, keys: [key('done', 'bool_ops')] },
  ],
}

const uncovered = (params: [string, string][], order = '') =>
  uncoveredReads(todos, params.map(([name, value]) => parseFilter(name, value)), order ? parseOrder(order) : []).map((read) => `${read.use} ${read.field.column} ${read.need}`)

describe('uncoveredReads', () => {
  it('passes filters and a sort an index of the right kind serves', () => {
    expect(uncovered([['id', 'gt.3'], ['title', 'ilike.*milk*'], ['tags', 'cs.{home}'], ['during', 'adj.[1,2)']], 'id.desc')).toEqual([])
    expect(uncovered([['meta->>kind', 'eq.work']])).toEqual([])
    expect(uncovered([['title', 'eq.Buy milk']])).toEqual([])
  })

  it('names a column no index serves, or not with the kind its operator needs', () => {
    expect(uncovered([['notes', 'eq.x']])).toEqual(['filter notes equality'])
    expect(uncovered([['title', 'gt.a']])).toEqual(['filter title btree'])
    expect(uncovered([['tags', 'sl.[1,2)']])).toEqual(['filter tags gist'])
    expect(uncovered([['meta->>cost', 'eq.3']])).toEqual(['filter meta equality'])
    expect(uncovered([], 'notes')).toEqual(['sort notes btree'])
  })

  it('counts a later key of a btree index only under a pin of the earlier ones', () => {
    expect(uncovered([['user_id', 'eq.u1']], 'id')).toEqual([])
    expect(uncovered([['user_id', 'in.(u1,u2)'], ['id', 'gt.4']])).toEqual([])
    expect(uncovered([['or', '(user_id.eq.u1,id.gt.4)']])).toEqual([])
    expect(uncovered([['user_id', 'not.eq.u1']], 'title')).toEqual(['sort title btree'])
  })

  it('reads every condition of a logic tree, and never a partial index', () => {
    expect(uncovered([['or', '(id.eq.1,and(notes.eq.x,done.is.true))']])).toEqual(['filter notes equality', 'filter done btree'])
  })

  it('needs an index on the columns an embed joins on, which pin the later keys', () => {
    expect(uncoveredReads(todos, [], parseOrder('id'), ['user_id']).map((read) => read.use)).toEqual([])
    expect(uncoveredReads(todos, [], [], ['notes'])).toEqual([{ field: { column: 'notes', json: [] }, need: 'equality', use: 'join' }])
    expect(scanRefusal({ name: 'todos' }, uncoveredReads(todos, [], [], ['notes'])[0]!).body.message).toBe('Embedding through "notes" needs an index that serves it')
  })

  it('judges nothing of a view or a foreign table', () => {
    expect(uncoveredReads({ kind: 'other', indexes: [] }, [parseFilter('notes', 'eq.x')], [])).toEqual([])
  })
})

describe('scanRefusal', () => {
  it('is a 400 naming the read, with the statement that adds the index as its hint', () => {
    const [notes] = uncoveredReads(todos, [parseFilter('notes', 'like.*x*')], [])
    expect(scanRefusal({ schema: 'public', name: 'todos' }, notes!).body).toEqual({ code: 'expensive-query', details: null, message: 'Filtering on "notes" needs a pg_trgm index that serves it', hint: 'create index on "public"."todos" using gin ("notes" gin_trgm_ops)' })
    const [cost] = uncoveredReads(todos, [parseFilter('meta->>cost', 'eq.3')], [])
    expect(scanRefusal({ name: 'todos' }, cost!).body.hint).toBe('create index on "todos" (("meta"->>\'cost\'))')
  })
})
