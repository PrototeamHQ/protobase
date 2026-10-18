import { describe, expect, it } from 'vitest'
import type { ColumnSpec, GridRow } from './column-spec'
import { badgeWidth, contentWidth, fitColumns, headerWidth } from './content-widths'

const spec = (id: string, kind: ColumnSpec['kind'], extra: Partial<ColumnSpec> = {}): ColumnSpec => ({ id, header: id, kind, width: 200, ...extra })

const rows: GridRow[] = [
  { id: '1', name: 'Nordlicht Systemtechnik und Industrieautomation GmbH & Co. KG of Lower Saxony', city: 'Bonn', status: 'active', total: 123456789, code: 'NL-1', vip: true },
  { id: '2', name: 'Acme', city: 'Köln', status: 'lead', total: 500, code: 'AC-22', vip: false },
]

const columns = [
  spec('name', 'text', { title: true }),
  spec('city', 'text'),
  spec('status', 'status', { minWidth: 120, labels: { active: 'Active', lead: 'Lead' } }),
  spec('total', 'money', { currency: 'EUR' }),
  spec('code', 'id', { minWidth: 150 }),
  spec('vip', 'boolean', { minWidth: 60, fixed: true }),
]

const byId = (specs: ColumnSpec[]) => Object.fromEntries(specs.map((column) => [column.id, column]))

describe('fitColumns', () => {
  const fitted = byId(fitColumns(columns, rows))

  it('leaves the columns as they are without rows', () => {
    expect(fitColumns(columns, [])).toBe(columns)
  })

  it('fixes a short enum at its badge width, never below its header room', () => {
    expect(fitted.status).toMatchObject({ fixed: true, width: 120 })
    const wide = byId(fitColumns([spec('status', 'status', { minWidth: 40, labels: { active: 'Active' } })], rows))
    expect(wide.status).toMatchObject({ fixed: true, width: badgeWidth(['Active', 'lead']) })
  })

  it('gives the long title the largest share, up to its cap', () => {
    expect(fitted.name).toMatchObject({ width: 400 })
    expect(fitted.name?.fixed).toBeFalsy()
  })

  it('gives short text a small share', () => {
    expect(fitted.city?.width).toBe(80)
  })

  it('gives the title at least the share of the widest other text', () => {
    const shortTitle = byId(fitColumns([spec('city', 'text', { title: true }), spec('name', 'text')], rows))
    expect(shortTitle.city?.width).toBe(shortTitle.name?.width)
  })

  it('fixes money at the width of its widest amount', () => {
    expect(fitted.total).toMatchObject({ fixed: true, width: contentWidth(columns[3]!, rows) })
    expect(fitted.total?.width).toBeGreaterThanOrEqual('€1,234,567.89'.length * 8)
  })

  it('leaves a column drawn by its own render alone', () => {
    const drawn = spec('city', 'text', { render: () => null })
    expect(fitColumns([drawn], rows)[0]).toBe(drawn)
  })

  it("lets an id column's minimum fit its longest code, up to a cap", () => {
    expect(fitted.code?.minWidth).toBe(Math.max(contentWidth(columns[4]!, rows), headerWidth('code', false)))
    const long = byId(fitColumns([spec('code', 'id')], [{ id: '1', code: 'X'.repeat(80) }]))
    expect(long.code?.minWidth).toBe(240)
  })
})
