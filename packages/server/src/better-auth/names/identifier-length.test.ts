import { describe, expect, it } from 'vitest'
import { checkConfiguredName, generatedName } from './identifier-length'

describe('a configured name', () => {
  it('is refused past 63 bytes, naming the setting', () => {
    expect(() => checkConfiguredName('a'.repeat(63), 'auth.tables.user.name')).not.toThrow()
    expect(() => checkConfiguredName('a'.repeat(64), 'auth.tables.user.name')).toThrow(/^auth\.tables\.user\.name "a{64}" is 64 bytes, past the 63 Postgres keeps/)
    // Bytes, not characters: 32 two-byte letters are 64 bytes.
    expect(() => checkConfiguredName('é'.repeat(32), 'auth.tables.session.columns.token')).toThrow(/is 64 bytes/)
  })

  it('is refused empty', () => {
    expect(() => checkConfiguredName('', 'auth.tables.prefix')).toThrow('auth.tables.prefix is empty')
  })
})

describe('a generated name', () => {
  it('is kept within 63 bytes', () => {
    expect(generatedName('session_user_id_idx')).toBe('session_user_id_idx')
    expect(generatedName('a'.repeat(63))).toBe('a'.repeat(63))
  })

  it('past 63 bytes, is shortened with the same hash suffix every time', () => {
    const long = `${'very_long_table_name_'.repeat(3)}user_id_idx`
    const short = generatedName(long)
    expect(Buffer.byteLength(short)).toBe(63)
    expect(short.startsWith(`${long.slice(0, 54)}_`)).toBe(true)
    expect(short).toMatch(/_[0-9a-f]{8}$/)
    expect(generatedName(long)).toBe(short)
    expect(generatedName(`${long}x`)).not.toBe(short)
  })

  it('never cuts a character in two', () => {
    const short = generatedName(`${'é'.repeat(40)}_idx`)
    expect(Buffer.byteLength(short)).toBeLessThanOrEqual(63)
    expect(short).toMatch(/^é+_[0-9a-f]{8}$/)
  })
})
