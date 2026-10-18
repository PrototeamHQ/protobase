import { useMemo, useState } from 'react'
import type { ColumnSpec, GridRow } from './column-spec'
import { fitColumns } from './content-widths'

type Size = Pick<ColumnSpec, 'width' | 'minWidth' | 'fixed'>

type Fitted = { key: string; sizes: Record<string, Size> }

const sizesOf = (specs: ColumnSpec[]) => Object.fromEntries(specs.map(({ id, width, minWidth, fixed }) => [id, { width, minWidth, fixed }]))

/**
 * `columns` sized by the first rows shown, fitted once per set of columns: later pages, filters and sorts keep those
 * widths, so columns never jump while scrolling, and a longer value later on is cut, with the whole of it on hover.
 */
export const useFittedColumns = (columns: ColumnSpec[], rows: GridRow[]) => {
  const key = columns.map((spec) => spec.id).sort().join(' ')
  const [fitted, setFitted] = useState<Fitted>()
  const current = fitted?.key === key ? fitted : undefined
  // Fitting is stored while rendering, the way React keeps state derived from earlier renders, so no frame shows the old widths
  if (!current && rows.length > 0) setFitted({ key, sizes: sizesOf(fitColumns(columns, rows)) })
  const sizes = current?.sizes
  return useMemo(() => (sizes ? columns.map((spec) => ({ ...spec, ...sizes[spec.id] })) : columns), [columns, sizes])
}
