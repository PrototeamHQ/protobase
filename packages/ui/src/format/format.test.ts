import { describe, expect, it } from 'vitest'
import { formatAgo, formatRelativeTime, formatApproxRows, formatDate, formatDateTime, formatInt, formatMoney, formatSigned } from './index'

describe('formatMoney', () => {
  it('formats cents as EUR by default', () => {
    expect(formatMoney(123456)).toBe('€1,234.56')
  })
  it('supports other currencies', () => {
    expect(formatMoney(5000, 'USD')).toContain('50.00')
  })
})

describe('numbers', () => {
  it('groups thousands', () => {
    expect(formatInt(10240000)).toBe('10,240,000')
  })
  it('signs quantities', () => {
    expect(formatSigned(12)).toBe('+12')
    expect(formatSigned(-12)).toBe('−12')
  })
  it('approximates large row counts', () => {
    expect(formatApproxRows(10_240_113)).toBe('about 10,240,000 rows')
    expect(formatApproxRows(48_213)).toBe('about 48,210 rows')
    expect(formatApproxRows(312)).toBe('312 rows')
  })
})

describe('dates', () => {
  const ms = Date.UTC(2026, 9, 6, 14, 32)
  it('formats in UTC', () => {
    expect(formatDate(ms)).toBe('6 Oct 2026')
    expect(formatDateTime(ms)).toBe('6 Oct 2026, 14:32')
  })
  it('formats natural relative time', () => {
    expect(formatRelativeTime(10)).toBe('just now')
    expect(formatRelativeTime(300)).toBe('5 minutes ago')
    expect(formatRelativeTime(7200)).toBe('2 hours ago')
    expect(formatRelativeTime(86_400)).toBe('yesterday')
    expect(formatRelativeTime(3 * 31_536_000 + 5)).toBe('3 years ago')
  })
  it('formats relative time', () => {
    expect(formatAgo(3)).toBe('3 s ago')
    expect(formatAgo(180)).toBe('3 min ago')
    expect(formatAgo(7200)).toBe('2 h ago')
  })
})
