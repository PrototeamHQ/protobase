import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { f, resource } from '@protobase/schema'
import type { ColumnSpec } from '../../data-grid'
import { fitColumns } from '../../data-grid/content-widths'
import { rowButtonMaxWidth, withRowButton } from './row-button-column'

const holds = resource('holds')
  .table('holds')
  .fields({ id: f.integer(), reason: f.text(), report_url: f.text() })
  .primaryKey((r) => r.id)
const model = holds.toModel()
const report = { label: 'Error report', href: '{report_url}' }
const specs: ColumnSpec[] = [
  { id: 'reason', header: 'Reason', kind: 'text', width: 200, title: true },
  { id: 'id', header: 'Id', kind: 'id', width: 80 },
]
const row = { id: '3', reason: 'The build broke', report_url: 'https://errors.example/e/42' }

describe('withRowButton', () => {
  it('adds the button as the last column on a wide screen', () => {
    const columns = withRowButton(specs, model, undefined, report, false)
    expect(columns.map((column) => column.id)).toEqual(['reason', 'id', '_row_button'])
    expect(columns.some((column) => column.below)).toBe(false)
    expect(renderToStaticMarkup(<>{columns[2]!.render!(row)}</>)).toContain('href="https://errors.example/e/42"')
  })

  it('puts the same button under the first cell on a narrow screen, without its column', () => {
    const columns = withRowButton(specs, model, undefined, report, true)
    expect(columns.map((column) => column.id)).toEqual(['reason', 'id'])
    expect(columns[1]!.below).toBeUndefined()
    const below = renderToStaticMarkup(<>{columns[0]!.below!(row)}</>)
    expect(below).toContain('href="https://errors.example/e/42"')
    expect(below).toContain('Error report')
  })

  it('keeps the button column on a narrow screen when there is no first cell to put it under', () => {
    expect(withRowButton([], model, undefined, report, true).map((column) => column.id)).toEqual(['_row_button'])
  })

  it('grows the button column to its longest label, up to the widest a button grows', () => {
    const answer = { label: '{reason}', to: { kind: 'record' as const, resource: 'holds', key: '{id}' } }
    const widthFor = (...reasons: string[]) => {
      const columns = withRowButton(specs, model, undefined, answer, false)
      const fitted = fitColumns(columns, reasons.map((reason, index) => ({ id: String(index), reason })))
      return fitted.find((column) => column.id === '_row_button')!
    }
    const short = widthFor('Answer on its page')
    expect(short.fixed).toBe(true)
    // A small button's label, padding and border, and the cell's padding
    expect(short.width).toBe(18 * 8 + 22 + 24)
    expect(widthFor('Answer', 'Answer on its page').width).toBe(short.width)
    expect(widthFor('Read the whole conversation about the wording before answering it').width).toBe(rowButtonMaxWidth.wide)
  })

  it('leaves room for the outside-link mark', () => {
    const fitted = fitColumns(withRowButton(specs, model, undefined, report, false), [row])
    expect(fitted.find((column) => column.id === '_row_button')!.width).toBe(12 * 8 + 22 + 20 + 24)
  })

  it('keeps the minimum width when no row has a button', () => {
    const fitted = fitColumns(withRowButton(specs, model, undefined, report, false), [{ ...row, report_url: null }])
    expect(fitted.find((column) => column.id === '_row_button')!.width).toBe(96)
  })

  it('caps a narrow screen\'s own button column lower', () => {
    expect(withRowButton([], model, undefined, report, true)[0]!.maxWidth).toBe(rowButtonMaxWidth.narrow)
  })
})
