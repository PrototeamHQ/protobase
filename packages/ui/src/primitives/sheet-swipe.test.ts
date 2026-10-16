import { describe, expect, it } from 'vitest'
import { closesSheet } from './sheet-swipe'

describe('closesSheet', () => {
  it('closes on a drag mostly downwards', () => {
    expect(closesSheet(10, 80)).toBe(true)
    expect(closesSheet(-30, 60)).toBe(true)
  })

  it('ignores a short drag, one upwards and one mostly sideways', () => {
    expect(closesSheet(0, 40)).toBe(false)
    expect(closesSheet(0, -120)).toBe(false)
    expect(closesSheet(120, 80)).toBe(false)
  })
})
