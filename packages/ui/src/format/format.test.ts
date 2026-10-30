import { afterEach, describe, expect, it } from 'vitest'
import { setAppLocale } from '../locale/active-locale'
import { formatAgo, formatRelativeTime, formatApproxRows, formatDate, formatDateTime, formatDayRange, formatInt, formatMonth, formatMonthName, formatMonthRange, formatTime, formatWeekday, formatWeekdayDate, formatMoney, formatSigned } from './index'

describe('formatMoney', () => {
  it('formats cents in the currency given', () => {
    expect(formatMoney(123456, 'EUR')).toBe('€1,234.56')
  })
  it('supports other currencies', () => {
    expect(formatMoney(5000, 'USD')).toContain('50.00')
  })
  it('shows the decimals asked for', () => {
    expect(formatMoney(145000, 'EUR', 0)).toBe('€1,450')
    expect(formatMoney(145049, 'EUR', 0)).toBe('€1,450')
    expect(formatMoney(145000, 'EUR')).toBe('€1,450.00')
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
    expect(formatApproxRows(1)).toBe('1 row')
    expect(formatApproxRows(0)).toBe('0 rows')
  })
})

describe('dates', () => {
  const ms = Date.UTC(2026, 9, 6, 14, 32)
  it('formats a date as it is and a time on the clock of the zone given', () => {
    expect(formatDate(ms)).toBe('6 Oct 2026')
    expect(formatDateTime(ms, 'UTC')).toBe('6 Oct 2026, 14:32')
    expect(formatDateTime(ms, 'Europe/Amsterdam')).toBe('6 Oct 2026, 16:32')
    expect(formatDateTime(Date.UTC(2026, 9, 6, 23, 5), 'Europe/Amsterdam')).toBe('7 Oct 2026, 01:05')
  })
  it("formats a calendar's month, week and days as they are, and times in the zone given", () => {
    expect(formatMonth(ms)).toBe('October 2026')
    expect(formatWeekday(ms)).toBe('Tue')
    expect(formatWeekdayDate(ms)).toBe('Tuesday, 6 Oct 2026')
    expect(formatTime(Date.UTC(2026, 9, 6, 23, 5), 'UTC')).toBe('23:05')
    expect(formatTime(Date.UTC(2026, 9, 6, 23, 5), 'Asia/Kolkata')).toBe('04:35')
    // ICU versions space the dash differently
    expect(formatDayRange(Date.UTC(2026, 9, 12), Date.UTC(2026, 9, 18))).toMatch(/^12\s?–\s?18 Oct 2026$/)
    expect(formatDayRange(Date.UTC(2026, 11, 28), Date.UTC(2027, 0, 3))).toMatch(/^28 Dec 2026\s–\s3 Jan 2027$/)
  })
  it("formats a timeline's quarter and its months", () => {
    expect(formatMonthName(ms)).toBe('October')
    expect(formatMonthRange(Date.UTC(2026, 9, 1), Date.UTC(2026, 11, 1))).toMatch(/^October\s?–\s?December 2026$/)
  })
  it('formats natural relative time', () => {
    expect(formatRelativeTime(10)).toBe('just now')
    expect(formatRelativeTime(300)).toBe('5 minutes ago')
    expect(formatRelativeTime(-7200)).toBe('in 2 hours')
    expect(formatRelativeTime(-10)).toBe('just now')
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

describe('in Dutch', () => {
  const ms = Date.UTC(2026, 9, 6, 14, 32)
  afterEach(() => setAppLocale(undefined))

  it('writes numbers, money and dates as in the Netherlands', () => {
    setAppLocale('nl')
    expect(formatInt(10240000)).toBe('10.240.000')
    expect(formatMoney(123456, 'EUR')).toBe('€\u00a01.234,56')
    expect(formatDate(ms)).toBe('6 okt 2026')
    expect(formatDateTime(ms, 'Europe/Amsterdam')).toBe('6 okt 2026, 16:32')
    expect(formatMonth(ms)).toBe('oktober 2026')
  })

  it('says how long ago in Dutch', () => {
    setAppLocale('nl')
    expect(formatApproxRows(48_213)).toBe('ongeveer 48.210 rijen')
    expect(formatApproxRows(1)).toBe('1 rij')
    expect(formatRelativeTime(10)).toBe('zojuist')
    expect(formatRelativeTime(86_400)).toBe('gisteren')
    expect(formatAgo(180)).toBe('3 min geleden')
  })

  it('goes back to English once the app sets no language', () => {
    setAppLocale('nl')
    formatInt(1000)
    setAppLocale(undefined)
    expect(formatInt(1000)).toBe('1,000')
  })
})
