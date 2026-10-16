import { describe, expect, it } from 'vitest'
import { cellText, columnLetters, columnName } from './sheet-cell'

describe('sheet cells', () => {
  it('shows a cell as the file does', () => {
    expect(cellText(null)).toBe('')
    expect(cellText({ date: '2026-03-01T14:30:00' })).toBe('2026-03-01 14:30:00')
    expect(cellText(true)).toBe('TRUE')
    expect(cellText(1.5)).toBe('1.5')
  })

  it('names a column by its header, or by its letters when the header is empty', () => {
    expect(columnLetters(0)).toBe('A')
    expect(columnLetters(27)).toBe('AB')
    expect(columnName(['Name', ' '], 0)).toBe('Name')
    expect(columnName(['Name', ' '], 1)).toBe('Column B')
  })
})
