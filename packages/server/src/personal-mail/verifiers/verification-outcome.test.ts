import { describe, expect, it } from 'vitest'
import { maxErrorLength, settledOutcome, validOutcome } from './verification-outcome'

const now = new Date('2026-08-01T00:00:00Z')
const later = new Date('2026-08-02T00:00:00Z')

describe('validOutcome', () => {
  it("takes verify's pending outcome only with expires_at, and check's without", () => {
    expect(validOutcome({ state: 'pending', expires_at: later }, now, true)).toEqual({ state: 'pending', expires_at: later })
    expect(validOutcome({ state: 'pending' }, now, true)).toBeUndefined()
    expect(validOutcome({ state: 'pending' }, now, false)).toEqual({ state: 'pending' })
  })

  it('takes a verified outcome only with a valid_until still to come', () => {
    expect(validOutcome({ state: 'verified', valid_until: later }, now, true)).toEqual({ state: 'verified', valid_until: later })
    expect(validOutcome({ state: 'verified', valid_until: now }, now, true)).toBeUndefined()
    expect(validOutcome({ state: 'verified' }, now, true)).toBeUndefined()
  })

  it("reads a report's ISO 8601 times", () => {
    expect(validOutcome({ state: 'verified', valid_until: '2026-08-02T00:00:00Z' }, now, false)).toEqual({ state: 'verified', valid_until: later })
    expect(validOutcome({ state: 'verified', valid_until: 'tomorrow' }, now, false)).toBeUndefined()
  })

  it('keeps error text with markup as it is, as data', () => {
    const error = '<script>alert(1)</script>"><img src=x onerror=alert(2)>\nSecond line\twith a tab'
    expect(validOutcome({ state: 'failed', error_code: 'from_rewritten', error }, now, true)).toEqual({ state: 'failed', error_code: 'from_rewritten', error })
  })

  it('refuses error text that is too long, rather than cutting it short', () => {
    expect(validOutcome({ state: 'failed', error_code: 'x', error: 'a'.repeat(maxErrorLength) }, now, true)).toBeDefined()
    expect(validOutcome({ state: 'failed', error_code: 'x', error: 'a'.repeat(maxErrorLength + 1) }, now, true)).toBeUndefined()
  })

  it('refuses error text with a NUL or another control character', () => {
    for (const error of ['a\u0000b', 'a\u0007b', 'a\u001bb', 'a\u007fb', 'a\rb']) expect(validOutcome({ state: 'failed', error_code: 'x', error }, now, true), JSON.stringify(error)).toBeUndefined()
  })

  it('refuses an error code that is not a plain lowercase name', () => {
    for (const error_code of ['', 'Rewritten', 'from rewritten', '1st', 'a'.repeat(65)]) expect(validOutcome({ state: 'failed', error_code }, now, true), error_code).toBeUndefined()
  })

  it('refuses any other state', () => {
    expect(validOutcome({ state: 'settled' }, now, true)).toBeUndefined()
    expect(validOutcome(undefined, now, true)).toBeUndefined()
  })
})

describe('settledOutcome', () => {
  it('takes only a verified or failed outcome, as a report settles', () => {
    expect(settledOutcome.safeParse({ state: 'pending', expires_at: '2026-08-02T00:00:00Z' }).success).toBe(false)
    expect(settledOutcome.safeParse({ state: 'failed', error_code: 'from_rewritten' }).success).toBe(true)
  })
})
