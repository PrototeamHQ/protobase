import { describe, expect, it } from 'vitest'
import type { FilterValue } from '@protobase/schema'
import { changeConstant } from './change-constant'

const span = { start: 0, end: 0 }
const number = (raw: string): FilterValue => ({ kind: 'number', value: Number(raw), raw, span })
const text = (value: string): FilterValue => ({ kind: 'string', value, span })

describe('changeConstant', () => {
  it('gives an integer as a number, as Postgres prints it', () => {
    expect(changeConstant('integer', number('7'), true)).toBe(7)
    expect(changeConstant('integer', text('007'), true)).toBe(7)
  })

  it('gives a bigint past a JS number as its text for equality, and none for an order', () => {
    expect(changeConstant('bigint', number('9007199254740993'), false)).toBe('9007199254740993')
    expect(changeConstant('bigint', number('9007199254740993'), true)).toBeUndefined()
  })

  it('gives a decimal a JS number holds exactly, and none it would round', () => {
    expect(changeConstant('decimal', number('12.50'), true)).toBe(12.5)
    expect(changeConstant('decimal', number('0.1'), true)).toBe(0.1)
    expect(changeConstant('decimal', number('0.10000000000000000001'), true)).toBeUndefined()
  })

  it('gives a boolean for equality only', () => {
    expect(changeConstant('boolean', { kind: 'boolean', value: false, span }, false)).toBe(false)
    expect(changeConstant('boolean', { kind: 'boolean', value: true, span }, true)).toBeUndefined()
  })

  it('gives a uuid in the lower case Postgres prints, for an order too', () => {
    expect(changeConstant('uuid', text('A0EEBC99-9C0B-4EF8-BB6D-6BB9BD380A11'), true)).toBe('a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11')
  })

  it('gives text for equality only, since its order is the collation', () => {
    expect(changeConstant('enum', text('paid'), false)).toBe('paid')
    expect(changeConstant('text', text('paid'), true)).toBeUndefined()
    expect(changeConstant('text', number('5'), false)).toBeUndefined()
  })

  it('gives no date, which the stream compares as text', () => {
    expect(changeConstant('date', text('2026-11-27'), false)).toBeUndefined()
  })
})
