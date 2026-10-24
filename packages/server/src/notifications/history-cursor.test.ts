import { describe, expect, it } from 'vitest'
import { historyCursor, historyPosition } from './history-cursor'

const position = { createdAt: new Date('2026-07-01T00:01:02.345Z'), id: '0b6f8a52-3c1e-4c7a-9d2f-6a4b8e1c2d3f' }
const encoded = (value: unknown) => Buffer.from(typeof value === 'string' ? value : JSON.stringify(value)).toString('base64url')

describe('the history cursor', () => {
  it('holds the position alone and gives it back', () => {
    const cursor = historyCursor(position)
    expect(JSON.parse(Buffer.from(cursor, 'base64url').toString())).toEqual({ t: position.createdAt.getTime(), i: position.id })
    expect(historyPosition(cursor)).toEqual(position)
  })

  it.each([
    ['garbage', 'not a cursor!'],
    ['an empty cursor', ''],
    ['a truncated cursor', historyCursor(position).slice(0, -6)],
    ['padding', `${historyCursor(position)}=`],
    ['no JSON', encoded('{"t":')],
    ['an array', encoded([1, 'a'])],
    ['a time as text', encoded({ t: '1', i: position.id })],
    ['a negative time', encoded({ t: -1, i: position.id })],
    ['a fractional time', encoded({ t: 1.5, i: position.id })],
    ['an id as a number', encoded({ t: 1, i: 7 })],
    ['an id with a slash', encoded({ t: 1, i: '../x' })],
    ['an added user', encoded({ t: 1, i: position.id, u: 'u10' })],
    ['an added page size', encoded({ t: 1, i: position.id, limit: 500 })],
    ['SQL text', encoded({ t: 1, i: "' or 1=1 --" })],
    ['a time past what a Date holds', encoded({ t: 9e15, i: position.id })],
  ])('refuses %s with a 400 that names nothing of it', (_, cursor) => {
    expect(() => historyPosition(cursor)).toThrow(expect.objectContaining({ status: 400, detail: 'The cursor is not one a history page gave' }))
  })
})
