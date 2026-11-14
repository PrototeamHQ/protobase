import { describe, expect, it } from 'vitest'
import type { ColumnSpec } from './column-spec'
import { fitKey } from './use-fitted-columns'

const button = (maxWidth: number): ColumnSpec => ({ id: '_row_button', header: '', kind: 'text', width: 152, minWidth: 96, maxWidth })
const name: ColumnSpec = { id: 'name', header: 'Name', kind: 'text', width: 160 }

describe('the fit of a set of columns', () => {
  it('fits again when a column is clamped to another maximum', () => {
    expect(fitKey([button(192)])).not.toBe(fitKey([button(288)]))
  })

  it('fits again when a column is clamped to another minimum', () => {
    expect(fitKey([{ ...button(288), minWidth: 120 }])).not.toBe(fitKey([button(288)]))
  })

  it('keeps its widths while the columns and their bounds stay the same, in any order', () => {
    expect(fitKey([name, button(288)])).toBe(fitKey([button(288), { ...name }]))
  })
})
