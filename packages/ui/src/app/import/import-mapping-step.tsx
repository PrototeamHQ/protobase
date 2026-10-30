import { TriangleAlert } from 'lucide-react'
import type { ResourceModel, ViewModel } from '@protobase/schema'
import { Segmented } from '../../primitives/segmented'
import { ImportSelect } from './import-select'
import { fieldLabel, matchFields, relationModel, requiredOnCreate, unmappedRequired, type ImportMode } from './mapping'
import { cellText, columnName } from './sheet-cell'
import type { ImportFlow } from './use-import-flow'
import { text } from './messages'

type ImportMappingStepProps = {
  flow: ImportFlow
  model: ResourceModel
  resources: Record<string, ResourceModel>
  views: Record<string, ViewModel>
  /** Whether the user may update records, which the update modes need. */
  canUpdate: boolean
}

const modes = (): Array<{ value: ImportMode; label: string }> => [
  { value: 'create', label: text('create') },
  { value: 'update', label: text('update') },
  { value: 'upsert', label: text('upsert') },
]

const modeHelp = { create: 'createHint', update: 'updateHint', upsert: 'upsertHint' } as const satisfies Record<ImportMode, string>

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
  const fieldOptions = [{ value: skip, label: text('doNotImport') }, ...flow.fields.map((field) => ({ value: field.name, label: `${fieldLabel(view, field.name)}${requiredOnCreate(field) ? ' *' : ''}` }))]
  const columnOptions = headers.map((_, column) => ({ value: String(column), label: columnName(headers, column) }))
  const keys = matchFields(model)

  return (
    <div className="flex flex-col gap-5">
      {canUpdate && (
        <div className="flex flex-col gap-1.5">
          <span className="font-medium">{text('rows')}</span>
          <div>
            <Segmented label={text('whatEachRowDoes')} size="md" value={flow.mode} options={modes()} onChange={flow.setMode} />
          </div>
          <p className="text-xs text-muted-foreground">{text(modeHelp[flow.mode])}</p>
        </div>
      )}
      {flow.mode !== 'create' && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <ImportSelect
            label={text('findBy')}
            value={flow.match?.field ?? skip}
            options={[{ value: skip, label: text('chooseField') }, ...keys.map((field) => ({ value: field.name, label: fieldLabel(view, field.name) }))]}
            onChange={(field) => flow.setMatch(field ? { field, column: flow.match?.column ?? 0 } : undefined)}
            help={text('findByHint')}
          />
          <ImportSelect
            label={text('foundInColumn')}
            value={flow.match ? String(flow.match.column) : skip}
            options={[{ value: skip, label: text('chooseColumn') }, ...columnOptions]}
            onChange={(column) => flow.setMatch(column && flow.match ? { ...flow.match, column: Number(column) } : flow.match)}
          />
        </div>
      )}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <ImportSelect
          label={text('numbers')}
          value={flow.options.decimal}
          options={[
            { value: '.', label: '1,234.56' },
            { value: ',', label: '1.234,56' },
          ]}
          onChange={(decimal) => flow.setOptions({ ...flow.options, decimal: decimal as '.' | ',' })}
        />
        <ImportSelect
          label={text('dates')}
          value={flow.options.dateOrder}
          options={[
            { value: 'dmy', label: text('dayFirst') },
            { value: 'mdy', label: text('monthFirst') },
          ]}
          onChange={(dateOrder) => flow.setOptions({ ...flow.options, dateOrder: dateOrder as 'dmy' | 'mdy' })}
          help={text('datesHint')}
        />
      </div>
      {flow.mode !== 'update' && <p className="-mb-3 text-xs text-muted-foreground">{text('requiredMarked')}</p>}
      <section aria-label={text('columns')} className="flex flex-col divide-y divide-border border-y">
        {headers.map((_, column) => {
          const mapped = flow.columns.find((entry) => entry.column === column)
          const field = mapped ? model.fields[mapped.field] : undefined
          const target = field ? relationModel(field, resources) : undefined
          const examples = sample.map((row) => cellText(row.cells[column] ?? null)).filter((example) => example !== '').slice(0, 3)
          const name = columnName(headers, column)
          return (
            <div key={column} className="grid grid-cols-1 gap-2 py-3 sm:grid-cols-2 sm:gap-4">
              <div className="min-w-0">
                <p className="truncate font-medium">{name}</p>
                <p className="truncate text-xs text-muted-foreground">{examples.length > 0 ? examples.join(', ') : text('emptyInFirstRows')}</p>
              </div>
              <div className="flex min-w-0 flex-col gap-2">
                <ImportSelect label={text('field')} name={text('fieldFor', { name })} value={mapped?.field ?? skip} options={fieldOptions} onChange={(next) => flow.mapColumn(column, next || undefined)} />
                {target && (
                  <ImportSelect
                    label={text('foundBy')}
                    name={text('pluralFoundBy', { plural: views[target.name]?.names?.plural ?? fieldLabel(view, field!.name) })}
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
            {text('noColumnFills', { fields: missing.map((field) => fieldLabel(view, field.name)).join(', ') })}
          </span>
        </p>
      )}
    </div>
  )
}
