import { describe, expect, it } from 'vitest'
import { menuKeyTarget } from './menu-keys'

describe('menuKeyTarget', () => {
  it('steps down and wraps from the last item to the first', () => {
    expect(menuKeyTarget('ArrowDown', 0, 3)).toBe(1)
    expect(menuKeyTarget('ArrowDown', 2, 3)).toBe(0)
  })

  it('steps up and wraps from the first item to the last', () => {
    expect(menuKeyTarget('ArrowUp', 2, 3)).toBe(1)
    expect(menuKeyTarget('ArrowUp', 0, 3)).toBe(2)
  })

  it('starts at an end when no item has the focus', () => {
    expect(menuKeyTarget('ArrowDown', -1, 3)).toBe(0)
    expect(menuKeyTarget('ArrowUp', -1, 3)).toBe(2)
  })

  it('jumps to the first and last item with Home and End', () => {
    expect(menuKeyTarget('Home', 1, 3)).toBe(0)
    expect(menuKeyTarget('End', 1, 3)).toBe(2)
  })

  it('keeps a single item focused', () => {
    expect(menuKeyTarget('ArrowDown', 0, 1)).toBe(0)
    expect(menuKeyTarget('ArrowUp', 0, 1)).toBe(0)
  })

  it('moves nowhere in an empty menu or for other keys', () => {
    expect(menuKeyTarget('ArrowDown', -1, 0)).toBeUndefined()
    expect(menuKeyTarget('Home', -1, 0)).toBeUndefined()
    expect(menuKeyTarget('Enter', 1, 3)).toBeUndefined()
    expect(menuKeyTarget('a', 1, 3)).toBeUndefined()
  })
})
