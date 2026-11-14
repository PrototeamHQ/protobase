import { describe, expect, it } from 'vitest'
import { decodeCursor, encodeCursor } from './cursor'
import type { CheckedFilter, ResourceModel } from '@protobase/schema'
import { field } from '../../../test-support/query'
import type { Scope } from './scope'
import type { SortKey } from './sort'
import { withoutField } from './prune-filter'

const keys: SortKey[] = [
  { field: field('qty', 'integer'), direction: 'asc' },
  { field: field('id', 'integer'), direction: 'asc' },
]

describe('cursor', () => {
  it('continues only the list that was kept to the same record', () => {
    const on = (value: string): Scope => ({ within: { kind: 'compare', op: '=', field: field('task_id', 'integer'), value: { kind: 'string', value, span: { start: 0, end: 0 } }, span: { start: 0, end: 0 } } })
    const cursor = encodeCursor(keys, ['1', '2'], undefined, on('1'))
    expect(decodeCursor(cursor, keys, undefined, on('1'))).toEqual(['1', '2'])
    expect(() => decodeCursor(cursor, keys, undefined, on('2'))).toThrowError(expect.objectContaining({ code: 'invalid_cursor' }))
  })

  it('continues only the list that held the same related() terms', () => {
    const target = { name: 'links', table: { name: 'links' } } as unknown as ResourceModel
    const key = field('task_id', 'integer')
    const subfilter = (value: string): CheckedFilter => ({ kind: 'compare', op: '=', field: field('objective_id', 'integer'), value: { kind: 'string', value, span: { start: 0, end: 0 } }, span: { start: 0, end: 0 } })
    const scope = (value: string): Scope => ({ parents: [{ field: key, parent: { model: target, key, scope: {} }, related: { model: target, filter: subfilter(value) } }] })
    const cursor = encodeCursor(keys, ['1', '2'], undefined, scope('40'))
    expect(decodeCursor(cursor, keys, undefined, scope('40'))).toEqual(['1', '2'])
    expect(() => decodeCursor(cursor, keys, undefined, scope('41'))).toThrowError(expect.objectContaining({ code: 'invalid_cursor' }))
    expect(() => decodeCursor(cursor, keys)).toThrowError(expect.objectContaining({ code: 'invalid_cursor' }))
    expect(() => decodeCursor(encodeCursor(keys, ['1', '2']), keys, undefined, scope('40'))).toThrowError(expect.objectContaining({ code: 'invalid_cursor' }))
  })

  it("continues only the list whose related() terms kept to the same page of their records", () => {
    const target = { name: 'links', table: { name: 'links' } } as unknown as ResourceModel
    const key = field('task_id', 'integer')
    const scope = (limit?: number, after?: string): Scope => ({
      parents: [{ field: key, parent: { model: target, key, scope: {} }, related: { model: target, ...(limit && { page: { keys, limit, ...(after && { after: [after, after] }) } }) } }],
    })
    const cursor = encodeCursor(keys, ['1', '2'], undefined, scope(2))
    expect(decodeCursor(cursor, keys, undefined, scope(2))).toEqual(['1', '2'])
    expect(() => decodeCursor(cursor, keys, undefined, scope(3))).toThrowError(expect.objectContaining({ code: 'invalid_cursor' }))
    expect(() => decodeCursor(cursor, keys, undefined, scope(2, '5'))).toThrowError(expect.objectContaining({ code: 'invalid_cursor' }))
    expect(() => decodeCursor(cursor, keys, undefined, scope())).toThrowError(expect.objectContaining({ code: 'invalid_cursor' }))
  })

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

  it('continues only the filter it was issued for', () => {
    const qty = field('qty', 'integer')
    const draft = (start: number): CheckedFilter => ({ kind: 'isNull', field: qty, span: { start, end: start + 9 } })
    const other: CheckedFilter = { kind: 'not', arg: draft(0), span: { start: 0, end: 13 } }
    const cursor = encodeCursor(keys, ['1', '2'], draft(0))
    expect(decodeCursor(cursor, keys, draft(4))).toEqual(['1', '2'])
    for (const filter of [other, undefined]) {
      expect(() => decodeCursor(cursor, keys, filter)).toThrowError(expect.objectContaining({ code: 'invalid_cursor' }))
    }
    expect(() => decodeCursor(encodeCursor(keys, ['1', '2']), keys, draft(0))).toThrowError(expect.objectContaining({ code: 'invalid_cursor' }))
  })

  it('rejects garbage without leaking parser errors', () => {
    for (const bad of ['', '%%%', btoa('nope'), btoa('[]'), btoa('{"s":"x","v":[]}'), btoa('{"s":[],"v":[],"f":1}')]) {
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
