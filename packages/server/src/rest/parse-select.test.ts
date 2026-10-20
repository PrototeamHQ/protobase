import { describe, expect, it } from 'vitest'
import { parseSelect } from './parse-select'

describe('parseSelect', () => {
  it('is every column when missing or empty', () => {
    expect(parseSelect(undefined)).toEqual([{ kind: 'all' }])
    expect(parseSelect('')).toEqual([{ kind: 'all' }])
  })

  it('reads columns, aliases, casts and JSON paths, spaces around items aside', () => {
    expect(parseSelect('*, key:id,priority::text,label:title::varchar,cost:meta->>cost,meta->a->0')).toEqual([
      { kind: 'all' },
      { kind: 'field', field: { column: 'id', json: [] }, alias: 'key' },
      { kind: 'field', field: { column: 'priority', json: [] }, cast: 'text' },
      { kind: 'field', field: { column: 'title', json: [] }, alias: 'label', cast: 'varchar' },
      { kind: 'field', field: { column: 'meta', json: [{ arrow: '->>', key: 'cost' }] }, alias: 'cost' },
      { kind: 'field', field: { column: 'meta', json: [{ arrow: '->', key: 'a' }, { arrow: '->', key: 0 }] } },
    ])
    expect(parseSelect('tags::text[]')).toEqual([{ kind: 'field', field: { column: 'tags', json: [] }, cast: 'text[]' }])
  })

  it('refuses a cast that is no bare type name, which could end the cast', () => {
    expect(() => parseSelect('id::int) from x;--')).toThrow()
    expect(() => parseSelect('id::text::int')).toThrow()
  })

  it('reads embeds with their alias, hint, join and items, nested ones too', () => {
    expect(parseSelect('id,owner:profiles!todos_user_id_fkey!inner(username),comments(body,author:profiles(*)),attachments()')).toEqual([
      { kind: 'field', field: { column: 'id', json: [] } },
      { kind: 'embed', name: 'profiles', alias: 'owner', hint: 'todos_user_id_fkey', inner: true, select: [{ kind: 'field', field: { column: 'username', json: [] } }] },
      { kind: 'embed', name: 'comments', inner: false, select: [{ kind: 'field', field: { column: 'body', json: [] } }, { kind: 'embed', name: 'profiles', alias: 'author', inner: false, select: [{ kind: 'all' }] }] },
      { kind: 'embed', name: 'attachments', inner: false, select: [] },
    ])
    expect(parseSelect('profiles!left!user_id(id)')).toEqual([{ kind: 'embed', name: 'profiles', hint: 'user_id', inner: false, select: [{ kind: 'field', field: { column: 'id', json: [] } }] }])
  })

  it('refuses spreads and aggregates, which come later', () => {
    expect(() => parseSelect('id,...profiles(username)')).toThrow(/spreads a resource or calls an aggregate/)
    expect(() => parseSelect('count()')).toThrow(/spreads a resource or calls an aggregate/)
    expect(() => parseSelect('priority.sum()')).toThrow(/spreads a resource or calls an aggregate/)
  })
})
