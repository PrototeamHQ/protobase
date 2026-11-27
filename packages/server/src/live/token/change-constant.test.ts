import { describe, expect, it } from 'vitest'
import { f, resource, type FilterValue } from '@protobase/schema'
import { changeConstant } from './change-constant'

const span = { start: 0, end: 0 }
const fields = resource('rows')
  .table('rows')
  .fields({
    id: f.integer(),
    views: f.bigint(),
    total: f.decimal({ precision: 30, scale: 10 }),
    paid: f.boolean(),
    owner: f.uuid(),
    status: f.enum(['draft', 'paid']),
    day: f.date(),
    customer_id: f.relation('customers'),
  })
  .primaryKey((r) => r.id)
  .toModel().fields

const number = (raw: string): FilterValue => ({ kind: 'number', value: Number(raw), raw, span })
const text = (value: string): FilterValue => ({ kind: 'string', value, span })

describe('changeConstant', () => {
  it('gives an integer as a number, as Postgres prints it', () => {
    expect(changeConstant(fields.id!, number('7'), true)).toBe(7)
    expect(changeConstant(fields.id!, text('007'), true)).toBe(7)
  })

  it('gives a bigint past a JS number as its text for equality, and none for an order', () => {
    expect(changeConstant(fields.views!, number('9007199254740993'), false)).toBe('9007199254740993')
    expect(changeConstant(fields.views!, number('9007199254740993'), true)).toBeUndefined()
  })

  it('gives a decimal a JS number holds exactly, and none it would round', () => {
    expect(changeConstant(fields.total!, number('12.50'), true)).toBe(12.5)
    expect(changeConstant(fields.total!, number('0.1'), true)).toBe(0.1)
    expect(changeConstant(fields.total!, number('0.10000000000000000001'), true)).toBeUndefined()
  })

  it('gives a boolean for equality only', () => {
    expect(changeConstant(fields.paid!, { kind: 'boolean', value: false, span }, false)).toBe(false)
    expect(changeConstant(fields.paid!, { kind: 'boolean', value: true, span }, true)).toBeUndefined()
  })

  it('gives a uuid in the lower case Postgres prints, for an order too', () => {
    expect(changeConstant(fields.owner!, text('A0EEBC99-9C0B-4EF8-BB6D-6BB9BD380A11'), true)).toBe('a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11')
  })

  it('gives text for equality only, since its order is the collation', () => {
    expect(changeConstant(fields.status!, text('paid'), false)).toBe('paid')
    expect(changeConstant(fields.status!, text('paid'), true)).toBeUndefined()
  })

  it('gives no date, which the stream compares as text', () => {
    expect(changeConstant(fields.day!, text('2026-11-27'), false)).toBeUndefined()
  })

  it('gives a related key only in the one form Postgres prints it in for any key type', () => {
    expect(changeConstant(fields.customer_id!, number('4'), true)).toBe(4)
    expect(changeConstant(fields.customer_id!, text('acme'), false)).toBe('acme')
    expect(changeConstant(fields.customer_id!, text('42'), false)).toBe('42')
    expect(changeConstant(fields.customer_id!, text('a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11'), false)).toBe('a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11')
    expect(changeConstant(fields.customer_id!, text('042'), false)).toBeUndefined()
    expect(changeConstant(fields.customer_id!, text('A0EEBC99-9C0B-4EF8-BB6D-6BB9BD380A11'), false)).toBeUndefined()
    expect(changeConstant(fields.customer_id!, text('acme'), true)).toBeUndefined()
  })
})
