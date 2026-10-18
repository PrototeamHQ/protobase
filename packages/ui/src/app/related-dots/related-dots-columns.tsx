import type { ResourceModel, ViewModel } from '@protobase/schema'
import type { ColumnSpec } from '../../data-grid'
import { headerWidth } from '../../data-grid/content-widths'
import { listColumnNames } from '../../live/columns-from-model'
import { humanize } from '../../live/naming'
import { RecordCard } from '../displays/record-card'
import { RelatedDots } from './related-dots'

/**
 * The list's columns with its view's related columns among them, in the order the view lists them: each draws its
 * records, which the list loads with its rows under the column's name, as dots.
 */
export const withRelatedDotsColumns = (columns: ColumnSpec[], model: ResourceModel, view: ViewModel | undefined, resources: Record<string, ResourceModel>, views: Record<string, ViewModel>): ColumnSpec[] => {
  const related = view?.list?.relatedColumns ?? []
  if (related.length === 0) return columns
  const byId = new Map(columns.map((spec) => [spec.id, spec]))
  return listColumnNames(model, view).flatMap((name): ColumnSpec[] => {
    const field = byId.get(name)
    if (field) return [field]
    const column = related.find((candidate) => candidate.name === name)
    const target = column && resources[column.resource]
    if (!column || !target) return []
    const header = column.label ?? humanize(column.name)
    return [
      {
        id: column.name,
        header,
        kind: 'text',
        width: 160,
        minWidth: headerWidth(header, false),
        sortable: false,
        render: (row) => <RelatedDots column={column} records={(row[column.name] as Array<Record<string, unknown>> | undefined) ?? []} target={target} view={views[target.name]} Card={RecordCard} />,
      },
    ]
  })
}
