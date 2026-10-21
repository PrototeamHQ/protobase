import { sql } from 'kysely'
import { describe, expect, it } from 'vitest'
import { embedsOf, resolveShape } from './embed-shape'
import type { ForeignKey } from './foreign-keys'
import { parseQuery } from './parse-query'

const foreignKeys: ForeignKey[] = [
  { name: 'todos_user_id_fkey', table: 'todos', columns: ['user_id'], foreignTable: 'profiles', foreignColumns: ['id'], unique: false },
  { name: 'comments_todo_id_fkey', table: 'comments', columns: ['todo_id'], foreignTable: 'todos', foreignColumns: ['id'], unique: false },
  { name: 'comments_author_id_fkey', table: 'comments', columns: ['author_id'], foreignTable: 'profiles', foreignColumns: ['id'], unique: false },
  { name: 'secrets_todo_id_fkey', table: 'secrets', columns: ['todo_id'], foreignTable: 'todos', foreignColumns: ['id'], unique: false },
]
const served = (name: string) => (name === 'secrets' ? undefined : sql.id(name))

const shapeOf = (params: [string, string][]) => {
  const query = parseQuery(params)
  return resolveShape({ foreignKeys, served, embedded: query.embedded }, 'todos', query.select)
}

describe('resolveShape', () => {
  it('resolves each embed to its relationship, a unique alias and the parameters under its path', () => {
    const shape = shapeOf([['select', 'id,owner:profiles(username),comments!inner(body,profiles(username))'], ['comments.likes', 'gte.2']])
    expect(embedsOf(shape).map(({ key, alias, toOne, inner, relationship, params }) => ({ key, alias, toOne, inner, via: relationship.foreignKey.name, filters: params.filters.length }))).toEqual([
      { key: 'owner', alias: 'profiles_1', toOne: true, inner: false, via: 'todos_user_id_fkey', filters: 0 },
      { key: 'comments', alias: 'comments_2', toOne: false, inner: true, via: 'comments_todo_id_fkey', filters: 1 },
      { key: 'profiles', alias: 'profiles_3', toOne: true, inner: false, via: 'comments_author_id_fkey', filters: 0 },
    ])
    expect(shape[0]).toEqual({ kind: 'field', field: { column: 'id', json: [] } })
  })

  it('finds no relationship to a table /api/sb/rest/v1 does not serve', () => {
    expect(() => shapeOf([['select', 'id,secrets(*)']])).toThrow("Could not find a relationship between 'todos' and 'secrets' in the schema cache")
  })
})
