import { ChevronLeft, ChevronRight } from 'lucide-react'
import { resolveFieldPath } from '@protobase/layout'
import type { ResourceModel } from '@protobase/schema'
import { humanize } from '../../live/naming'
import { Button } from '../../primitives/button'
import { useAdminMeta } from '../meta-gate'
import { Link } from '../router'
import { FieldValue } from './field-value'
import { scopeOf } from './use-layout-data'
import { usePathValue } from './use-path-value'
import { useRelationLabels } from './use-relation-labels'

type Row = Record<string, unknown>

const isPath = (column: string) => column.includes('.')

/** The header of a column: the label of the field it ends at, from that field's view. */
const useHeader = (model: ResourceModel) => {
  const { resources, views } = useAdminMeta()
  return (column: string) => {
    const resolved = resolveFieldPath(resources, model.name, column)
    const last = resolved.ok ? resolved.steps.at(-1)! : undefined
    const name = last?.field.name ?? column
    return views[last?.model.name ?? model.name]?.fields[name]?.label ?? humanize(name)
  }
}

/** A value through relations (`unitId.propertyId`), fetched like the record page fetches it and cached. */
const PathCell = ({ model, row, column }: { model: ResourceModel; row: Row; column: string }) => {
  const value = usePathValue(scopeOf(model, row), column)
  if (value.state === 'loading') return <span className="text-muted-foreground">…</span>
  if (value.state === 'missing') return <span className="text-muted-foreground">—</span>
  return <FieldValue model={value.model} field={value.field} value={value.value} />
}

export type Pager = { page: number; hasPrevious: boolean; hasNext: boolean; busy: boolean; previous: () => void; next: () => void }

/**
 * Records as table rows; the first column opens the record, unless it is a relation, which links to the record it
 * names instead (a join record's first column is usually what it joins). Columns may follow relations (`unitId.propertyId`).
 */
export const RecordTable = ({ model, columns, rows, label, pager }: { model: ResourceModel; columns: string[]; rows: Row[]; label: string; pager?: Pager }) => {
  const { resources } = useAdminMeta()
  const header = useHeader(model)
  const first = columns[0] === undefined ? undefined : resolveFieldPath(resources, model.name, columns[0])
  const opensRecord = !first?.ok || first.steps.at(-1)!.field.type !== 'relation'
  const labels = useRelationLabels(model, columns.filter((column) => !isPath(column)), rows)
  const cell = (row: Row, column: string) =>
    isPath(column) ? (
      <PathCell model={model} row={row} column={column} />
    ) : (
      <FieldValue model={model} field={model.fields[column]!} value={row[column]} relationLabel={labels.get(column)?.get(String(row[column]))} />
    )
  return (
    <>
      <div className="-mx-4 overflow-x-auto">
        <table className="w-full min-w-max text-left text-[13px]">
          <thead>
            <tr className="border-b text-xs text-muted-foreground">
              {columns.map((column) => (
                <th key={column} scope="col" className="px-4 py-2 font-medium">
                  {header(column)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const scope = scopeOf(model, row)
              return (
                <tr key={scope.key} className="border-b last:border-0 hover:bg-surface">
                  {columns.map((column, index) => (
                    <td key={column} className="px-4 py-2">
                      {index === 0 && opensRecord ? (
                        <Link to={`/${model.name}/${encodeURIComponent(scope.key)}`} className="font-medium text-primary-text hover:underline">
                          {cell(row, column)}
                        </Link>
                      ) : (
                        cell(row, column)
                      )}
                    </td>
                  ))}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      {pager && (pager.hasPrevious || pager.hasNext) && (
        <nav aria-label={`${label} pages`} className="mt-3 flex items-center justify-end gap-2 text-xs text-muted-foreground">
          <span>Page {pager.page}</span>
          <Button size="sm" aria-label="Previous page" disabled={!pager.hasPrevious || pager.busy} onClick={pager.previous}>
            <ChevronLeft className="size-3.5" />
          </Button>
          <Button size="sm" aria-label="Next page" disabled={!pager.hasNext || pager.busy} onClick={pager.next}>
            <ChevronRight className="size-3.5" />
          </Button>
        </nav>
      )}
    </>
  )
}
