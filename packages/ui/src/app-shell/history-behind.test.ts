import { describe, expect, it } from 'vitest'
import { visitedAfter } from './history-behind'

describe('visitedAfter', () => {
  it('stacks a forward navigation', () => {
    expect(visitedAfter(['/dashboard'], '/orders', false)).toEqual(['/dashboard', '/orders'])
  })

  it('takes the page left off on a step back, so the one behind is the step before', () => {
    expect(visitedAfter(['/dashboard', '/orders/1', '/orders'], '/orders/1', true)).toEqual(['/dashboard', '/orders/1'])
  })

  it('starts again from here on any other step', () => {
    expect(visitedAfter(['/dashboard', '/orders'], '/settings', true)).toEqual(['/settings'])
  })

  it('keeps the stack while the page stays', () => {
    const stack = ['/dashboard', '/orders']
    expect(visitedAfter(stack, '/orders', true)).toBe(stack)
  })
})
