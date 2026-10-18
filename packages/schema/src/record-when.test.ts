import { describe, expect, test } from 'vitest'
import { isRecordCondition } from './record-when'

describe('isRecordCondition', () => {
  test('is false for the keywords and for nothing', () => {
    for (const when of ['always', 'editing', 'reading', undefined]) expect(isRecordCondition(when)).toBe(false)
  })

  test('is true for any other text', () => {
    expect(isRecordCondition('status = "done"')).toBe(true)
  })
})
