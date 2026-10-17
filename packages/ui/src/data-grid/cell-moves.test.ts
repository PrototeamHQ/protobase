import { describe, expect, it } from 'vitest'
import { movedCell, nextEditable } from './cell-moves'

const columns = ['name', 'price', 'status']

describe('movedCell', () => {
  it('moves one row up or down, and one column left or right', () => {
    expect(movedCell({ index: 2, column: 'price' }, 'ArrowUp', columns, 5)).toEqual({ index: 1, column: 'price' })
    expect(movedCell({ index: 2, column: 'price' }, 'ArrowDown', columns, 5)).toEqual({ index: 3, column: 'price' })
    expect(movedCell({ index: 2, column: 'price' }, 'ArrowLeft', columns, 5)).toEqual({ index: 2, column: 'name' })
    expect(movedCell({ index: 2, column: 'price' }, 'ArrowRight', columns, 5)).toEqual({ index: 2, column: 'status' })
  })

  it('stays at the edges of the grid', () => {
    expect(movedCell({ index: 0, column: 'name' }, 'ArrowUp', columns, 5)).toBeUndefined()
    expect(movedCell({ index: 4, column: 'name' }, 'ArrowDown', columns, 5)).toBeUndefined()
    expect(movedCell({ index: 0, column: 'name' }, 'ArrowLeft', columns, 5)).toBeUndefined()
    expect(movedCell({ index: 0, column: 'status' }, 'ArrowRight', columns, 5)).toBeUndefined()
  })
})

describe('nextEditable', () => {
  const editable = (column: string) => column !== 'price'

  it('skips the columns that are not edited in place', () => {
    expect(nextEditable('name', columns, editable, 1)).toBe('status')
    expect(nextEditable('status', columns, editable, -1)).toBe('name')
  })

  it('finds none past the end of the row', () => {
    expect(nextEditable('status', columns, editable, 1)).toBeUndefined()
    expect(nextEditable('name', columns, editable, -1)).toBeUndefined()
  })
})
