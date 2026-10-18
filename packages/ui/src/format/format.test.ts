import { describe, expect, it } from 'vitest'
import { formatAgo, formatRelativeTime, formatApproxRows, formatDate, formatDateTime, formatDayRange, formatInt, formatMonth, formatTime, formatWeekday, formatWeekdayDate, formatMoney, formatSigned } from './index'

describe('formatMoney', () => {
  it('formats cents as EUR by default', () => {
    expect(formatMoney(123456)).toBe('€1,234.56')
  })
  it('supports other currencies', () => {
    expect(formatMoney(5000, 'USD')).toContain('50.00')
  })
  it('shows the decimals asked for', () => {
    expect(formatMoney(145000, 'EUR', 0)).toBe('€1,450')
    expect(formatMoney(145049, 'EUR', 0)).toBe('€1,450')
    expect(formatMoney(145000)).toBe('€1,450.00')
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
  it("formats a calendar's month, week, days and times in UTC", () => {
    expect(formatMonth(ms)).toBe('October 2026')
    expect(formatWeekday(ms)).toBe('Tue')
    expect(formatWeekdayDate(ms)).toBe('Tuesday, 6 Oct 2026')
    expect(formatTime(Date.UTC(2026, 9, 6, 23, 5))).toBe('23:05')
    // ICU versions space the dash differently
    expect(formatDayRange(Date.UTC(2026, 9, 12), Date.UTC(2026, 9, 18))).toMatch(/^12\s?–\s?18 Oct 2026$/)
    expect(formatDayRange(Date.UTC(2026, 11, 28), Date.UTC(2027, 0, 3))).toMatch(/^28 Dec 2026\s–\s3 Jan 2027$/)
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
