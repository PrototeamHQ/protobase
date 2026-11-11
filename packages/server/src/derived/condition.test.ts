import { describe, expect, it } from 'vitest'
import { equalityKeys, equalityOf, mayMatch, type Condition } from './condition'

const types = { owner: 'uuid', id: 'integer', status: 'enum', due: 'timestamp', score: 'decimal', notes: 'json' }

describe('mayMatch', () => {
  it('compares exactly-typed values as text, whichever form they come in', () => {
    expect(mayMatch({ field: 'id', op: '=', value: '7' }, { id: 7 }, types)).toBe(true)
    expect(mayMatch({ field: 'id', op: '=', value: 8 }, { id: 7 }, types)).toBe(false)
    expect(mayMatch({ field: 'status', op: 'in', values: ['open', 'late'] }, { status: 'done' }, types)).toBe(false)
  })

  it('orders numbers and times, and a null meets no comparison', () => {
    expect(mayMatch({ field: 'due', op: '<', value: '2026-11-10T00:00:00.000Z' }, { due: '2026-11-09T12:00:00+00:00' }, types)).toBe(true)
    expect(mayMatch({ field: 'due', op: '<', value: '2026-11-10T00:00:00.000Z' }, { due: '2026-11-11T12:00:00+00:00' }, types)).toBe(false)
    expect(mayMatch({ field: 'score', op: '>=', value: '2.5' }, { score: '2.50' }, types)).toBe(true)
    expect(mayMatch({ field: 'due', op: '<', value: '2026-11-10T00:00:00.000Z' }, { due: null }, types)).toBe(false)
  })

  it('counts what it cannot tell as a match, and never lets NOT turn that into a miss', () => {
    const cannot: Condition = { field: 'notes', op: '=', value: 'x' }
    expect(mayMatch(cannot, { notes: { a: 1 } }, types)).toBe(true)
    expect(mayMatch({ not: cannot }, { notes: { a: 1 } }, types)).toBe(true)
    expect(mayMatch({ field: 'id', op: '=', value: 1 }, {}, types)).toBe(true)
    expect(mayMatch({ and: [{ maybe: true }, { field: 'id', op: '=', value: 1 }] }, { id: 2 }, types)).toBe(false)
    expect(mayMatch({ or: [{ maybe: true }, { field: 'id', op: '=', value: 1 }] }, { id: 2 }, types)).toBe(true)
  })
})

describe('the equality index', () => {
  it('finds the equality every matching row has, and the keys a record holds', () => {
    expect(equalityOf({ and: [{ maybe: true }, { field: 'id', op: '=', value: 3 }] }, types)).toEqual({ field: 'id', value: '3' })
    expect(equalityOf({ or: [{ field: 'id', op: '=', value: 3 }] }, types)).toBeUndefined()
    expect(equalityOf({ field: 'score', op: '=', value: 3 }, types)).toBeUndefined()
    expect(equalityKeys({ id: 3, status: null, score: '2.5' }, types)).toEqual([{ field: 'id', value: '3' }])
  })

  it('holds a uuid in the one form Postgres compares it by, whichever form a query gave', () => {
    const row = { owner: '0b7e4c2a-1f3d-4e5a-9b6c-7d8e9f0a1b2c' }
    const given: Condition = { field: 'owner', op: '=', value: '{0B7E4C2A1F3D4E5A9B6C7D8E9F0A1B2C}' }
    expect(mayMatch(given, row, types)).toBe(true)
    expect(equalityOf(given, types)).toEqual(equalityKeys(row, types)[0])
  })
})
