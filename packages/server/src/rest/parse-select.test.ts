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

  it('refuses embedding and aggregates, which come later', () => {
    expect(() => parseSelect('id,profiles(username)')).toThrow(/embeds a resource or calls an aggregate/)
    expect(() => parseSelect('count()')).toThrow(/embeds a resource or calls an aggregate/)
  })
})
