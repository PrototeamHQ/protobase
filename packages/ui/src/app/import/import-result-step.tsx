import { Download } from 'lucide-react'
import { Button } from '../../primitives/button'
import { ErrorBanner } from '../error-banner'
import { downloadRows, ProblemList } from './import-check-step'
import { ImportCounts } from './import-counts'
import type { ImportProgress } from './run-import'
import { formatTag } from '../../locale/active-locale'

const count = (value: number) => value.toLocaleString(formatTag())

/** The rows written so far out of those to write, as a bar. */
export const ImportProgressStep = ({ progress, total, cancelling }: { progress: ImportProgress; total: number; cancelling: boolean }) => {
  const done = progress.created + progress.updated + progress.failed
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-2 text-xs">
        <span className="text-muted-foreground">{cancelling ? 'Stopping after this batch…' : 'Saving rows…'}</span>
        <span className="tabular-nums">
          {count(done)} / {count(total)}
        </span>
      </div>
      <div role="progressbar" aria-label="Rows saved" aria-valuenow={done} aria-valuemin={0} aria-valuemax={total} className="h-2 overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${total > 0 ? Math.min(100, (done / total) * 100) : 0}%` }} />
      </div>
    </div>
  )
}

type ImportSummaryProps = {
  result: ImportProgress & { cancelled: boolean }
  /** The error that stopped the import before its end. */
  stopped?: unknown
  headers: string[]
  fileName?: string
}

/** What the import did: created, updated, skipped and failed rows, and the rows it did not write with the reasons, to download. */
export const ImportSummary = ({ result, stopped, headers, fileName }: ImportSummaryProps) => (
  <div className="flex flex-col gap-4">
    {stopped !== undefined && <ErrorBanner title="The import stopped. The rows counted below were saved." error={stopped} />}
    {result.cancelled && <p role="status">Cancelled. The rows counted below were saved.</p>}
    <ImportCounts
      label="Import summary"
      counts={[
        ['Created', result.created],
        ['Updated', result.updated],
        ['Skipped', result.skipped],
        ['Failed', result.failed],
      ]}
    />
    {result.notWritten.length > 0 && (
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          <h3 className="font-medium">Rows not imported</h3>
          <Button size="sm" onClick={() => downloadRows(fileName, headers, result.notWritten)}>
            <Download className="size-3.5" />
            Download
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">Skipped rows had problems in the file; the server refused the failed ones. The file holds each with the reason, to fix and import again.</p>
        <ProblemList rows={[...result.notWritten].sort((a, b) => a.line - b.line)} />
      </div>
    )}
  </div>
)
