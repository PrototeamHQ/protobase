import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { f, resource } from '@protobase/schema'
import type { ColumnSpec } from '../../data-grid'
import { withRowButton } from './row-button-column'

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
})
