import { describe, expect, it } from 'vitest'
import { belongsToOf, refused } from './record-tool-args'

// A database driver's error: its SQLSTATE and the raw message that must not reach the client.
const databaseError = (code: string) => Object.assign(new Error('violates constraint "secret_internal_name"'), { code, constraint: 'secret_internal_name' })

describe('refused', () => {
  it.each([
    ['check', '23514', 'invalid-record', 'A check constraint rejected the record'],
    ['not-null', '23502', 'invalid-record', 'A required column has no value'],
    ['foreign key', '23503', 'conflict', 'The record points at, or is pointed at by, another record'],
    ['unique', '23505', 'conflict', 'A record with the same unique value already exists'],
  ])('turns a %s violation into the refusal REST gives, without the database message', (_, code, error, message) => {
    const text = refused(databaseError(code))
    expect(JSON.parse(text)).toEqual({ error, message })
    expect(text).not.toContain('secret_internal_name')
  })

  it('throws an error it has no refusal for', () => {
    const error = new Error('boom')
    expect(() => refused(error)).toThrow(error)
  })
})

describe('belongsToOf', () => {
  it('passes a resource and a key on, and nothing without one', () => {
    expect(belongsToOf({})).toEqual({})
    expect(belongsToOf({ belongs_to: { resource: 'objectives', key: 40 } })).toEqual({ belongs_to: { resource: 'objectives', key: 40 } })
  })

  it('refuses anything else, so it never reads as no filter at all', () => {
    for (const belongs_to of [null, 'objectives', { resource: 'objectives' }, { resource: 'objectives', key: [40, 41] }]) expect(belongsToOf({ belongs_to })).toBeUndefined()
  })
})
