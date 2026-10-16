import { Download } from 'lucide-react'
import type { ResourceModel, ViewModel } from '@protobase/schema'
import { displayValue } from '../../live/display-value'
import { saveFile } from '../../lib/save-file'
import { Button } from '../../primitives/button'
import { Spinner } from '../../primitives/spinner'
import { failedRowsCsv } from './failed-rows'
import { ImportCounts } from './import-counts'
import { fieldLabel, relationModel, type ColumnMapping } from './mapping'
import { batchRows, type FailedRow, type ImportCheck } from './run-import'

/** How many rows with problems the check lists; the file of them holds every one. */
const listedProblems = 50

/** Saves the rows with their problems as a CSV named after the imported file. */
export const downloadRows = (fileName: string | undefined, headers: string[], rows: FailedRow[]) =>
  saveFile(failedRowsCsv(headers, rows), `${(fileName ?? 'import').replace(/\.[^.]+$/, '')} - not imported.csv`, 'text/csv')

/** The rows with what keeps each from being imported, at most `listedProblems` of them. */
export const ProblemList = ({ rows }: { rows: FailedRow[] }) => (
  <ul aria-label="Rows not imported" className="flex flex-col gap-1 text-xs">
    {rows.slice(0, listedProblems).map((row) => (
      <li key={row.line}>
        <span className="font-medium">Row {row.line}:</span> {row.problems.join('; ')}
      </li>
    ))}
    {rows.length > listedProblems && <li className="text-muted-foreground">And {(rows.length - listedProblems).toLocaleString('en-IE')} more rows, all in the file.</li>}
  </ul>
)

export const ImportChecking = ({ rows }: { rows: number }) => (
  <p className="flex items-center gap-2 text-[13px] text-muted-foreground" role="status">
    <Spinner className="size-3.5" />
    Checking rows… {rows.toLocaleString('en-IE')} read
  </p>
)

type ImportCheckStepProps = {
  check: ImportCheck
  model: ResourceModel
  resources: Record<string, ResourceModel>
  views: Record<string, ViewModel>
  columns: ColumnMapping[]
  headers: string[]
  fileName?: string
}

/**
 * What the import would do, before it writes anything: how many rows create or update a record, the first rows as they
 * would be written, and every row with problems, which the import skips.
 */
export const ImportCheckStep = ({ check, model, resources, views, columns, headers, fileName }: ImportCheckStepProps) => {
  const view = views[model.name]
  const shown = columns.map((column) => model.fields[column.field]!)
  return (
    <div className="flex flex-col gap-4 text-[13px]">
      <ImportCounts
        label="Check"
        counts={[
          ['Rows', check.rows],
          ['To create', check.creates],
          ['To update', check.updates],
          ['With problems', check.problems.length],
        ]}
      />
      {check.preview.length > 0 && (
        // A table as wide as its columns scrolls sideways inside the dialog, which scrolls down as a whole
        <div className="overflow-x-auto rounded-lg border">
          <table aria-label="First rows" className="w-full text-left text-xs">
            <thead className="bg-muted text-muted-foreground">
              <tr>
                <th className="px-2 py-1.5 font-medium">Row</th>
                {shown.map((field) => (
                  <th key={field.name} className="whitespace-nowrap px-2 py-1.5 font-medium">
                    {fieldLabel(view, field.name)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y">
              {check.preview.map((row) => (
                <tr key={row.line} className={row.problems.length > 0 ? 'bg-danger-soft' : undefined}>
                  <td className="px-2 py-1.5 tabular-nums text-muted-foreground">{row.line}</td>
                  {shown.map((field) => (
                    <td key={field.name} className="max-w-48 truncate px-2 py-1.5">
                      {relationModel(field, resources) ? String(row.values[field.name] ?? '—') : field.name in row.values ? displayValue(field, row.values[field.name], view?.fields[field.name]) : ''}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {check.problems.length > 0 && (
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between gap-2">
            <h3 className="font-medium">Rows with problems, which are skipped</h3>
            <Button size="sm" onClick={() => downloadRows(fileName, headers, check.problems)}>
              <Download className="size-3.5" />
              Download
            </Button>
          </div>
          <ProblemList rows={check.problems} />
        </div>
      )}
      <p className="text-xs text-muted-foreground">Rows are saved in batches of {batchRows}. Cancelling, or an error, keeps the batches already saved; a row the server refuses is listed and the others are saved.</p>
    </div>
  )
}
