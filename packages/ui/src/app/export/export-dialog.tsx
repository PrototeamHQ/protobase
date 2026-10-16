import { ArrowDown, ArrowUp } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { formatApproxRows, formatInt } from '../../format'
import { Button } from '../../primitives/button'
import { Checkbox } from '../../primitives/checkbox'
import { ResponsiveDialog } from '../../primitives/responsive-dialog'
import { Segmented } from '../../primitives/segmented'
import type { ExportFormat } from './builder'
import type { ExportMode } from './cells'
import { exportLimit, type ExportScope, type ExportSettings } from './export-options'
import type { ViewModel } from '@protobase/schema'

/** How many rows the list finds: exact up to 10,000, the planner's estimate above, or still being counted. */
export type RowCount = { kind: 'counting' } | { kind: 'exact'; rows: number } | { kind: 'estimate'; rows: number }

export type ExportDialogProps = {
  /** The records' name, such as "Orders". */
  plural: string
  view: ViewModel | undefined
  /** The fields a file may hold, in the resource's order, each with its label. */
  fields: Array<{ name: string; label: string }>
  /** The columns it starts with: the list's own. */
  initialColumns: string[]
  /** How many rows the list finds. */
  count: RowCount
  /** How many rows are selected, when some are and they can be exported. */
  selected?: number
  open: boolean
  onExport: (settings: ExportSettings) => void
  onClose: () => void
}

const formatOptions: Array<{ value: ExportFormat; label: string }> = [
  { value: 'xlsx', label: 'Excel (.xlsx)' },
  { value: 'csv', label: 'CSV' },
]

const modeOptions: Array<{ value: ExportMode; label: string }> = [
  { value: 'shown', label: 'As shown' },
  { value: 'raw', label: 'Raw values' },
]

const modeHelp: Record<ExportMode, string> = {
  shown: 'Labels, dates and numbers as the list shows them.',
  raw: 'Values as they are stored, such as keys and codes.',
}

// Up to 10,000 rows are counted exactly; above that the count is the planner's estimate.
const countText = (count: RowCount) => {
  if (count.kind === 'counting') return 'Counting rows…'
  if (count.kind === 'exact') return formatApproxRows(count.rows)
  return count.rows > 10_000 ? formatApproxRows(count.rows) : 'more than 10,000 rows'
}

/** The fewest rows the list finds, as far as the count tells: an estimate stands only above 10,000. */
export const countedRows = (count: RowCount) => {
  if (count.kind === 'counting') return undefined
  return count.kind === 'exact' ? count.rows : Math.max(count.rows, 10_001)
}

const Setting = ({ label, help, children }: { label: string; help?: string; children: ReactNode }) => (
  <div className="flex flex-col items-start gap-1.5">
    <span className="text-[13px] font-medium">{label}</span>
    {children}
    {help && <span className="text-xs text-muted-foreground">{help}</span>}
  </div>
)

const move = (columns: string[], name: string, by: -1 | 1) => {
  const index = columns.indexOf(name)
  const next = [...columns]
  next.splice(index, 1)
  next.splice(index + by, 0, name)
  return next
}

/**
 * The columns a file holds, in order: the chosen ones first, each with buttons that move it up or down, then the
 * fields left out, to add. The dialog scrolls when the list is long, so it has no scroll box of its own.
 */
const ColumnPicker = ({ fields, columns, onChange }: { fields: ExportDialogProps['fields']; columns: string[]; onChange: (columns: string[]) => void }) => {
  const labels = Object.fromEntries(fields.map((field) => [field.name, field.label]))
  const ordered = [...columns, ...fields.map((field) => field.name).filter((name) => !columns.includes(name))]
  return (
    <ul className="divide-y self-stretch rounded-md border" aria-label="Columns">
      {ordered.map((name) => {
        const chosen = columns.includes(name)
        const index = columns.indexOf(name)
        return (
          <li key={name} className="flex min-h-10 items-center gap-2 px-3 py-1">
            <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2.5">
              <Checkbox checked={chosen} label={labels[name]} onChange={(checked) => onChange(checked ? [...columns, name] : columns.filter((column) => column !== name))} />
              <span className={chosen ? 'truncate' : 'truncate text-muted-foreground'}>{labels[name]}</span>
            </label>
            {chosen && (
              <span className="flex shrink-0 gap-1">
                <Button size="sm" variant="ghost" className="min-h-8 px-2" aria-label={`Move ${labels[name]} up`} disabled={index === 0} onClick={() => onChange(move(columns, name, -1))}>
                  <ArrowUp className="size-3.5" />
                </Button>
                <Button size="sm" variant="ghost" className="min-h-8 px-2" aria-label={`Move ${labels[name]} down`} disabled={index === columns.length - 1} onClick={() => onChange(move(columns, name, 1))}>
                  <ArrowDown className="size-3.5" />
                </Button>
              </span>
            )}
          </li>
        )
      })}
    </ul>
  )
}

/**
 * The Export dialog: the file's format, which rows (the list's, or the selected ones), which columns in which order, and
 * whether values are exported as shown or raw, with the number of rows before it starts.
 */
export const ExportDialog = ({ plural, view, fields, initialColumns, count, selected, open, onExport, onClose }: ExportDialogProps) => {
  const [format, setFormat] = useState<ExportFormat>('xlsx')
  const [scope, setScope] = useState<ExportScope>(selected ? 'selected' : 'list')
  const [columns, setColumns] = useState(initialColumns)
  const [mode, setMode] = useState<ExportMode>('shown')

  const limit = exportLimit(view, format)
  const rows = scope === 'selected' ? `${formatInt(selected ?? 0)} selected ${selected === 1 ? 'row' : 'rows'}` : countText(count)
  const overLimit = (scope === 'selected' ? (selected ?? 0) : (countedRows(count) ?? 0)) > limit
  const scopeOptions: Array<{ value: ExportScope; label: string }> = [
    { value: 'list', label: 'Rows in the list' },
    { value: 'selected', label: `Selected (${formatInt(selected ?? 0)})` },
  ]

  return (
    <ResponsiveDialog
      title={`Export ${plural.toLowerCase()}`}
      open={open}
      onClose={onClose}
      actions={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={columns.length === 0} onClick={() => onExport({ format, scope, columns, mode })}>
            Export
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4 text-[13px]">
        <Setting label="Format">
          <Segmented size="md" label="Format" value={format} options={formatOptions} onChange={setFormat} />
        </Setting>
        {selected !== undefined && selected > 0 && (
          <Setting label="Rows" help={scope === 'list' ? 'With the list’s filters, search and sort.' : undefined}>
            <Segmented size="md" label="Rows" value={scope} options={scopeOptions} onChange={setScope} />
          </Setting>
        )}
        <Setting label="Values" help={modeHelp[mode]}>
          <Segmented size="md" label="Values" value={mode} options={modeOptions} onChange={setMode} />
        </Setting>
        <Setting label="Columns">
          <ColumnPicker fields={fields} columns={columns} onChange={setColumns} />
        </Setting>
        <p role="status" className="text-muted-foreground">
          Exports {rows}.{overLimit && ` A file holds at most ${formatInt(limit)} rows; the rest are left out.`}
        </p>
      </div>
    </ResponsiveDialog>
  )
}

/** While the file is built: how many rows are in it so far, out of how many, and a way to stop. */
export const ExportProgressDialog = ({ plural, done, total, onCancel }: { plural: string; done: number; total?: number; onCancel: () => void }) => {
  const share = total ? Math.min(1, done / total) : undefined
  return (
    <ResponsiveDialog title={`Exporting ${plural.toLowerCase()}`} open onClose={onCancel} actions={<Button onClick={onCancel}>Cancel</Button>}>
      <div className="flex flex-col gap-2 text-[13px]">
        <div role="progressbar" aria-label="Rows exported" aria-valuemin={0} aria-valuemax={total} aria-valuenow={done} className="h-1.5 overflow-hidden rounded-full bg-muted">
          <div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${(share ?? 0) * 100}%` }} />
        </div>
        <p className="text-muted-foreground">{total ? `${formatInt(done)} of ${formatInt(total)} rows` : `${formatInt(done)} rows`}</p>
      </div>
    </ResponsiveDialog>
  )
}
