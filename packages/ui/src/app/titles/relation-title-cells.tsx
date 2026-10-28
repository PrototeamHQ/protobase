import type { ResourceModel, ViewModel } from '@protobase/schema'
import { renderCell } from '../../data-grid/cells'
import type { ColumnSpec } from '../../data-grid/column-spec'
import { TruncatedText } from '../../data-grid/truncated-text'
import { useRelationTitle } from './use-relation-title'

// A relation's value as a list row carries it: the key, or `{ id, name }` when the list named it
const relationKey = (value: unknown) => String(typeof value === 'object' && value !== null && 'id' in value ? value.id : value)

// Drawn as the built-in relation cell draws its text
const RelationTitleCell = ({ target, id }: { target: ResourceModel; id: string }) => (
  <TruncatedText text={useRelationTitle(target, id) ?? id} className="font-medium text-primary-text hover:underline" />
)

/**
 * The list's columns, where a relation points at a resource whose view derives its titles, drawn with the record's
 * title for the reader, its key while the title loads. A column a field type draws stays as it is.
 */
export const withRelationTitleCells = (columns: ColumnSpec[], model: ResourceModel, resources: Record<string, ResourceModel>, views: Record<string, ViewModel>): ColumnSpec[] =>
  columns.map((spec) => {
    const field = model.fields[spec.id]
    const target = field?.type === 'relation' && field.relation ? resources[field.relation.resource] : undefined
    if (spec.render || !target || !views[target.name]?.titleFrom) return spec
    return { ...spec, render: (row) => (row[spec.id] == null ? renderCell(spec, null) : <RelationTitleCell target={target} id={relationKey(row[spec.id])} />) }
  })
