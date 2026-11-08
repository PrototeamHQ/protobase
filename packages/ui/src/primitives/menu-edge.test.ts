import { describe, expect, it } from 'vitest'
import { menuRightEdge } from './menu-edge'

describe('menuRightEdge', () => {
  it('lines a menu up with a trigger at the right edge of the viewport', () => {
    expect(menuRightEdge(370, 160, 390)).toBe(370)
  })

  it('shifts a menu right just far enough to keep its left edge on screen for a trigger at the left edge', () => {
    const right = menuRightEdge(48, 160, 390)
    expect(right - 160).toBe(4)
  })

  it('keeps a menu off the right edge of the viewport', () => {
    expect(menuRightEdge(389, 160, 390)).toBe(386)
  })

  it('keeps the right edge on screen for a menu wider than the viewport', () => {
    expect(menuRightEdge(48, 500, 390)).toBe(386)
  })
})
