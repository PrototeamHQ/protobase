import { describe, expect, it } from 'vitest'
import { refused } from './record-tool-args'

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
