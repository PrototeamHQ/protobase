import { createColumnHelper, rowSelectionFeature, rowSortingFeature, tableFeatures } from '@tanstack/react-table'
import { renderCell } from './cells'
import type { ColumnSpec, GridRow } from './column-spec'

export const features = tableFeatures({ rowSortingFeature, rowSelectionFeature })

const helper = createColumnHelper<typeof features, GridRow>()

export const buildColumns = (specs: ColumnSpec[]) =>
  helper.columns(
    specs.map((spec) =>
      helper.accessor((row) => (spec.value ? spec.value(row) : row[spec.id]), {
        id: spec.id,
        header: spec.header,
        enableSorting: spec.sortable ?? false,
        cell: (context) => renderCell(spec, context.getValue()),
      }),
    ),
  )
