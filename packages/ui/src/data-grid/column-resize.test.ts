import { describe, expect, it } from 'vitest'
import type { ColumnSpec } from './column-spec'
import { minColumnWidth, resizedWidth, withResizedWidths } from './column-resize'

const name: ColumnSpec = { id: 'name', header: 'Name', kind: 'text', width: 200 }
const code: ColumnSpec = { id: 'code', header: 'Code', kind: 'id', width: 120, minWidth: 140 }

describe('resizedWidth', () => {
  it('moves the edge by the drag', () => {
    expect(resizedWidth(200, 48.4)).toBe(248)
    expect(resizedWidth(200, -50)).toBe(150)
  })

  it('stops at the minimum', () => {
    expect(resizedWidth(200, -500)).toBe(minColumnWidth)
  })

  it('keeps a column the app made narrower than the minimum at its width, and lets it grow', () => {
    expect(resizedWidth(40, -20)).toBe(40)
    expect(resizedWidth(40, 10)).toBe(50)
  })
})

describe('withResizedWidths', () => {
  it('fixes a resized column at its width and leaves the others as the app gave them', () => {
    expect(withResizedWidths([name, code], { name: 320 })).toEqual([{ ...name, fixed: true, width: 320, minWidth: undefined }, code])
  })

  it('lets a column go below the minimum width the app gave it', () => {
    expect(withResizedWidths([code], { code: 80 })[0]).toMatchObject({ width: 80, minWidth: undefined, fixed: true })
  })

  it('without resized widths is the app widths', () => {
    expect(withResizedWidths([name, code], {})).toEqual([name, code])
  })
})
