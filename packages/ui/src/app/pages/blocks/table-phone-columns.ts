import { columnName, phoneColumns, type TableColumn } from '@protobase/layout'
import type { ColumnSpec } from '../../../data-grid'

/**
 * The columns of a `Table` a phone shows, by `phoneColumns`: those of `columns` with a priority, or, with none given,
 * the title, then badge columns such as enums, then the rest. `columns` omitted takes the specs' own, the list's.
 */
export const phoneSpecs =
  (columns: TableColumn[] | undefined) =>
  (specs: ColumnSpec[]): ColumnSpec[] => {
    const traits = new Map(specs.map((spec) => [spec.id, { title: spec.title, badge: spec.kind === 'status' }]))
    const known = (columns ?? specs.map((spec) => spec.id)).filter((column) => traits.has(columnName(column)))
    const shown = new Set(phoneColumns(known, (name) => traits.get(name)!))
    return specs.filter((spec) => shown.has(spec.id))
  }
