import { describe, expect, it } from 'vitest'
import { pascal } from './naming'

describe('pascal', () => {
  it.each([
    ['stock_moves', 'StockMoves'],
    ['stockMoves', 'StockMoves'],
    ['orders', 'Orders'],
  ])('names %s as %s', (name, expected) => {
    expect(pascal(name)).toBe(expected)
  })
})
