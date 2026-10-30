import { describe, expect, it } from 'vitest'
import { entriesPerMinute, guestLimits, pollsPerMinute, refusalsPerMinute } from './guest-limits'

describe("the lobby's limits", () => {
  it('let an address enter a few times a minute, and again once the minute turned', () => {
    let at = 0
    const limits = guestLimits(() => at)
    for (let i = 0; i < entriesPerMinute; i++) expect(limits.enter('1.2.3.4')).toBe(true)
    expect(limits.enter('1.2.3.4')).toBe(false)
    expect(limits.enter('5.6.7.8')).toBe(true)
    at = 60_000
    expect(limits.enter('1.2.3.4')).toBe(true)
  })

  it('block an address that sent too many refused tokens, for the rest of the minute', () => {
    let at = 0
    const limits = guestLimits(() => at)
    for (let i = 0; i < refusalsPerMinute - 1; i++) limits.refused('1.2.3.4')
    expect(limits.blocked('1.2.3.4')).toBe(false)
    limits.refused('1.2.3.4')
    expect(limits.blocked('1.2.3.4')).toBe(true)
    expect(limits.blocked('5.6.7.8')).toBe(false)
    at = 60_000
    expect(limits.blocked('1.2.3.4')).toBe(false)
  })

  it('let a guest ask after their wait about once a second', () => {
    const limits = guestLimits(() => 0)
    for (let i = 0; i < pollsPerMinute; i++) expect(limits.poll('g')).toBe(true)
    expect(limits.poll('g')).toBe(false)
  })
})
