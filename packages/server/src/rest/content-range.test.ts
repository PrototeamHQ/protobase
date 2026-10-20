import { describe, expect, it } from 'vitest'
import { contentRange, rangeStatus } from './content-range'

describe('contentRange and rangeStatus', () => {
  it('names the rows of the page and the total when counted', () => {
    expect(contentRange(0, 2, 7)).toBe('0-1/7')
    expect(contentRange(5, 2)).toBe('5-6/*')
    expect(contentRange(0, 0)).toBe('*/*')
    expect(contentRange(3, 0, 0)).toBe('*/0')
  })

  it('is 206 for part of the rows, 200 for all of them or uncounted, and 416 past them', () => {
    expect(rangeStatus(0, 2, 7)).toBe(206)
    expect(rangeStatus(0, 7, 7)).toBe(200)
    expect(rangeStatus(0, 0, 0)).toBe(200)
    expect(rangeStatus(10, 2)).toBe(200)
    expect(() => rangeStatus(20, 0, 7)).toThrow(expect.objectContaining({ status: 416, headers: { 'content-range': '*/7' } }))
  })
})
