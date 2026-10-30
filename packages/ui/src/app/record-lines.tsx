import { useState } from 'react'
import { InlineChildTable, lineTableMinWidth, type LineColumn } from '../inline-child-table'
import { recordTitle } from '../live/model-helpers'
import { humanize } from '../live/naming'
import { formatInt } from '../format'
import { Section } from '../record-view'
import { isChosen, keyValue } from './create/create-values'
import { useAdminMeta, usePermissions } from './meta-gate'
import { can, rowAllows } from './permissions'
import { LineCell } from './record-lines-cell'
import { linesLimit } from './use-lines'
import type { ShownLine } from './use-lines-draft'
import type { RecordLinesData } from './use-record-lines'
import { text } from './record-messages'

type RecordLinesProps = {
  lines: RecordLinesData & { model: NonNullable<RecordLinesData['model']> }
  /** The record's form is open and its lines may change; on the read view, or a record that cannot change, they only show. */
  editable: boolean
  saving: boolean
}

/**
 * The lines of a record as a table of their view's columns, edited in place: a line's fields, new lines, removed ones
 * and their order only change the draft; the record's Save writes it all, in one batch. A line the server turns down
 * says why on its row.
 */
export const RecordLines = ({ lines, editable, saving }: RecordLinesProps) => {
  const { resources, views } = useAdminMeta()
  const { model, columns, data, draft } = lines
  const permissions = usePermissions(model.name)
  const view = views[model.name]
  // The name of the record a relation was just set to, by line and field, until the saved lines name it
  const [picked, setPicked] = useState<Record<string, string>>({})
  const open = editable && data.complete && !data.loading && !saving
  const canUpdate = open && can(permissions, 'update')
  const canCreate = open && can(permissions, 'create')
  const canDelete = open && can(permissions, 'delete')
  const writable = (line: ShownLine) => (line.stored ? canUpdate && rowAllows(line.stored, 'update') : canCreate)
  const placeOf = (line: ShownLine) => draft.shown.indexOf(line) + 1
  const rejected = (line: ShownLine) => (draft.rejection?.id === line.id ? draft.rejection : undefined)

  const tableColumns: LineColumn<ShownLine>[] = columns.map((name) => {
    const field = model.fields[name]!
    const hints = view?.fields[name]
    const label = hints?.label ?? humanize(name)
    const target = field.relation ? resources[field.relation.resource] : undefined
    const pickable = target && target.primaryKey.length === 1 ? target : undefined
    return {
      key: name,
      label,
      ...(['integer', 'bigint', 'decimal'].includes(field.type) && { align: 'right' as const, width: 'minmax(6rem,0.6fr)' }),
      cell: (line) => {
        const value = draft.value(line.id, name)
        const chosen = value === null || value === undefined || value === '' ? undefined : String(value)
        return (
          <LineCell
            field={field}
            hints={hints}
            label={label}
            lineNumber={placeOf(line)}
            resource={model.name}
            value={value}
            stored={line.stored?.[name]}
            relationLabel={chosen === undefined ? undefined : (picked[`${line.id}/${name}`] ?? data.labels[name]?.[chosen])}
            relationTo={pickable && chosen !== undefined ? { kind: 'record', resource: pickable.name, key: chosen } : undefined}
            relationPicker={pickable && { target: pickable, view: views[pickable.name] }}
            locked={!writable(line)}
            problem={rejected(line)?.fields[name]}
            onChange={(next) => {
              if (!pickable || !isChosen(next)) return draft.change(line.id, name, next)
              setPicked((current) => ({ ...current, [`${line.id}/${name}`]: next.label }))
              draft.change(line.id, name, keyValue(pickable, next.key))
            }}
          />
        )
      },
    }
  })

  // A refusal that names none of the fields on screen says why under the line
  const lineError = (line: ShownLine) => {
    const rejection = rejected(line)
    if (!rejection || columns.some((name) => rejection.fields[name])) return undefined
    return rejection.message
  }

  return (
    <Section title={text('lines')} help={text('linesHelp')}>
      {!data.complete && <p className="mb-2 text-muted-foreground">{text('tooManyLines', formatInt(linesLimit))}</p>}
      <div className="-mx-4 overflow-x-auto px-4 [-webkit-overflow-scrolling:touch] md:mx-0 md:px-0">
        <div style={{ minWidth: lineTableMinWidth(tableColumns) }}>
          <InlineChildTable
            lines={draft.shown}
            columns={tableColumns}
            lineName={(line) => recordTitle(model, view, line.stored ?? {}, '') || text('lineNumber', placeOf(line))}
            onReorder={(next) => draft.setOrder(next.map((line) => line.id))}
            reorderable={canUpdate}
            onAdd={canCreate ? () => void draft.add() : undefined}
            onRemove={canCreate || canDelete ? (line) => draft.remove(line.id) : undefined}
            removable={(line) => (line.stored ? canDelete && rowAllows(line.stored, 'delete') : canCreate)}
            lineError={lineError}
          />
        </div>
      </div>
    </Section>
  )
}
