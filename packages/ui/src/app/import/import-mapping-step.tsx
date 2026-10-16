import { TriangleAlert } from 'lucide-react'
import type { ResourceModel, ViewModel } from '@protobase/schema'
import { Segmented } from '../../primitives/segmented'
import { ImportSelect } from './import-select'
import { fieldLabel, matchFields, relationModel, requiredOnCreate, unmappedRequired, type ImportMode } from './mapping'
import { cellText, columnName } from './sheet-cell'
import type { ImportFlow } from './use-import-flow'

type ImportMappingStepProps = {
  flow: ImportFlow
  model: ResourceModel
  resources: Record<string, ResourceModel>
  views: Record<string, ViewModel>
  /** Whether the user may update records, which the update modes need. */
  canUpdate: boolean
}

const modes: Array<{ value: ImportMode; label: string }> = [
  { value: 'create', label: 'Create' },
  { value: 'update', label: 'Update' },
  { value: 'upsert', label: 'Create or update' },
]

const modeHelp: Record<ImportMode, string> = {
  create: 'Each row creates a record.',
  update: 'Each row updates the record its value finds; a row that finds none is not imported.',
  upsert: 'Each row updates the record its value finds, or creates one when it finds none.',
}

const skip = ''

/**
 * Which field each column of the file fills: matched by header to a field's label or name, changed or skipped here. A
 * relation's column also says which field of the related records its values are, and an update which column finds the
 * records it changes.
 */
export const ImportMappingStep = ({ flow, model, resources, views, canUpdate }: ImportMappingStepProps) => {
  const view = views[model.name]
  const headers = flow.head?.headers ?? []
  const sample = flow.head?.sample ?? []
  const missing = unmappedRequired(flow.mode, flow.fields, flow.columns)
  const fieldOptions = [{ value: skip, label: 'Do not import' }, ...flow.fields.map((field) => ({ value: field.name, label: `${fieldLabel(view, field.name)}${requiredOnCreate(field) ? ' *' : ''}` }))]
  const columnOptions = headers.map((_, column) => ({ value: String(column), label: columnName(headers, column) }))
  const keys = matchFields(model)

  return (
    <div className="flex flex-col gap-5">
      {canUpdate && (
        <div className="flex flex-col gap-1.5">
          <span className="font-medium">Rows</span>
          <div>
            <Segmented label="What each row does" size="md" value={flow.mode} options={modes} onChange={flow.setMode} />
          </div>
          <p className="text-xs text-muted-foreground">{modeHelp[flow.mode]}</p>
        </div>
      )}
      {flow.mode !== 'create' && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <ImportSelect
            label="Find records by"
            value={flow.match?.field ?? skip}
            options={[{ value: skip, label: 'Choose a field' }, ...keys.map((field) => ({ value: field.name, label: fieldLabel(view, field.name) }))]}
            onChange={(field) => flow.setMatch(field ? { field, column: flow.match?.column ?? 0 } : undefined)}
            help="A field no two records share, such as the key or an email."
          />
          <ImportSelect
            label="Found in column"
            value={flow.match ? String(flow.match.column) : skip}
            options={[{ value: skip, label: 'Choose a column' }, ...columnOptions]}
            onChange={(column) => flow.setMatch(column && flow.match ? { ...flow.match, column: Number(column) } : flow.match)}
          />
        </div>
      )}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <ImportSelect
          label="Numbers"
          value={flow.options.decimal}
          options={[
            { value: '.', label: '1,234.56' },
            { value: ',', label: '1.234,56' },
          ]}
          onChange={(decimal) => flow.setOptions({ ...flow.options, decimal: decimal as '.' | ',' })}
        />
        <ImportSelect
          label="Dates"
          value={flow.options.dateOrder}
          options={[
            { value: 'dmy', label: 'Day first (31/12/2026)' },
            { value: 'mdy', label: 'Month first (12/31/2026)' },
          ]}
          onChange={(dateOrder) => flow.setOptions({ ...flow.options, dateOrder: dateOrder as 'dmy' | 'mdy' })}
          help="Dates written as 2026-12-31 read the same either way. Times without a zone are your own time."
        />
      </div>
      {flow.mode !== 'update' && <p className="-mb-3 text-xs text-muted-foreground">New records need the fields marked *.</p>}
      <section aria-label="Columns" className="flex flex-col divide-y divide-border border-y">
        {headers.map((_, column) => {
          const mapped = flow.columns.find((entry) => entry.column === column)
          const field = mapped ? model.fields[mapped.field] : undefined
          const target = field ? relationModel(field, resources) : undefined
          const examples = sample.map((row) => cellText(row.cells[column] ?? null)).filter((text) => text !== '').slice(0, 3)
          const name = columnName(headers, column)
          return (
            <div key={column} className="grid grid-cols-1 gap-2 py-3 sm:grid-cols-2 sm:gap-4">
              <div className="min-w-0">
                <p className="truncate font-medium">{name}</p>
                <p className="truncate text-xs text-muted-foreground">{examples.length > 0 ? examples.join(', ') : 'Empty in the first rows'}</p>
              </div>
              <div className="flex min-w-0 flex-col gap-2">
                <ImportSelect label="Field" name={`Field for ${name}`} value={mapped?.field ?? skip} options={fieldOptions} onChange={(next) => flow.mapColumn(column, next || undefined)} />
                {target && (
                  <ImportSelect
                    label="Found by"
                    name={`${views[target.name]?.names?.plural ?? fieldLabel(view, field!.name)} found by`}
                    value={mapped!.matchBy ?? target.primaryKey[0]!}
                    options={matchFields(target).map((candidate) => ({ value: candidate.name, label: fieldLabel(views[target.name], candidate.name) }))}
                    onChange={(matchBy) => flow.matchColumnBy(column, matchBy)}
                  />
                )}
              </div>
            </div>
          )
        })}
      </section>
      {missing.length > 0 && (
        <p role="alert" className="flex gap-2 rounded-lg border border-warning/30 bg-warning-soft px-3 py-2 text-warning-text">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" />
          <span>
            No column fills {missing.map((field) => fieldLabel(view, field.name)).join(', ')}, which new records need.
          </span>
        </p>
      )}
    </div>
  )
}
