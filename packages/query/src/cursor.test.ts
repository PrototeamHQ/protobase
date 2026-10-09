import { describe, expect, it } from 'vitest'
import { decodeCursor, encodeCursor } from './cursor'
import type { CheckedFilter } from '@protobase/schema'
import { field } from '../../../test-support/query'
import type { SortKey } from './sort'
import { withoutField } from './prune-filter'

const keys: SortKey[] = [
  { field: field('qty', 'integer'), direction: 'asc' },
  { field: field('id', 'integer'), direction: 'asc' },
]

describe('cursor', () => {
  it('round-trips values including unicode, commas and quotes', () => {
    const values = ['a, "b" ✓', '42']
    expect(decodeCursor(encodeCursor(keys, values), keys)).toEqual(values)
  })

  it('round-trips nulls and non-Latin-1 text', () => {
    const values = ['Größe ß ä ö ü', null, '日本語 🎉']
    const three = [...keys, keys[0]!]
    expect(decodeCursor(encodeCursor(three, values), three)).toEqual(values)
  })

  it('accepts boundary cursors on the leading key', () => {
    expect(decodeCursor(encodeCursor(keys, ['7']), keys)).toEqual(['7'])
  })

  it('rejects cursors for another sort', () => {
    const other: SortKey[] = [{ ...keys[0]!, direction: 'desc' }, keys[1]!]
    expect(() => decodeCursor(encodeCursor(keys, ['1', '2']), other)).toThrowError(expect.objectContaining({ code: 'invalid_cursor' }))
  })

  it('rejects garbage without leaking parser errors', () => {
    for (const bad of ['', '%%%', btoa('nope'), btoa('[]'), btoa('{"s":"x","v":[]}')]) {
      expect(() => decodeCursor(bad, keys)).toThrowError(expect.objectContaining({ code: 'invalid_cursor' }))
    }
  })
})

describe('withoutField', () => {
  const [fa, fb] = [field('a', 'integer'), field('b', 'integer')]
  const span = { start: 0, end: 0 }
  const a = { kind: 'isNull', field: fa, span } as const
  const b = { kind: 'isNull', field: fb, span } as const
  const and = (...args: CheckedFilter[]): CheckedFilter => ({ kind: 'and', args, span })
  const or = (...args: CheckedFilter[]): CheckedFilter => ({ kind: 'or', args, span })
  const not = (arg: CheckedFilter): CheckedFilter => ({ kind: 'not', arg, span })

  it('drops leaves, empty groups and negations of dropped leaves', () => {
    expect(withoutField(and(a, b), 'a')).toEqual(and(b))
    expect(withoutField(and(a, or(a), not(a)), 'a')).toBeUndefined()
    expect(withoutField(and(b, not(a)), 'a')).toEqual(and(b))
    expect(withoutField(not(b), 'a')).toEqual(not(b))
    expect(withoutField(undefined, 'a')).toBeUndefined()
  })

  it('keeps text search, which belongs to no field', () => {
    const search: CheckedFilter = { kind: 'search', text: 'x', span }
    expect(withoutField(and(a, search), 'a')).toEqual(and(search))
  })
})
