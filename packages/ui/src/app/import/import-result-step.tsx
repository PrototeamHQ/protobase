import { Download } from 'lucide-react'
import { Button } from '../../primitives/button'
import { ErrorBanner } from '../error-banner'
import { downloadRows, ProblemList } from './import-check-step'
import { ImportCounts } from './import-counts'
import type { ImportProgress } from './run-import'
import { formatTag } from '../../locale/active-locale'
import { text } from './messages'

const count = (value: number) => value.toLocaleString(formatTag())

/** The rows written so far out of those to write, as a bar. */
export const ImportProgressStep = ({ progress, total, cancelling }: { progress: ImportProgress; total: number; cancelling: boolean }) => {
  const done = progress.created + progress.updated + progress.failed
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-2 text-xs">
        <span className="text-muted-foreground">{cancelling ? text('stopping') : text('saving')}</span>
        <span className="tabular-nums">
          {count(done)} / {count(total)}
        </span>
      </div>
      <div role="progressbar" aria-label={text('rowsSaved')} aria-valuenow={done} aria-valuemin={0} aria-valuemax={total} className="h-2 overflow-hidden rounded-full bg-muted">
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
    {stopped !== undefined && <ErrorBanner title={text('stopped')} error={stopped} />}
    {result.cancelled && <p role="status">{text('cancelled')}</p>}
    <ImportCounts
      label={text('summary')}
      counts={[
        [text('created'), result.created],
        [text('updated'), result.updated],
        [text('skipped'), result.skipped],
        [text('failed'), result.failed],
      ]}
    />
    {result.notWritten.length > 0 && (
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          <h3 className="font-medium">{text('rowsNotImported')}</h3>
          <Button size="sm" onClick={() => downloadRows(fileName, headers, result.notWritten)}>
            <Download className="size-3.5" />
            {text('download')}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">{text('notWrittenHint')}</p>
        <ProblemList rows={[...result.notWritten].sort((a, b) => a.line - b.line)} />
      </div>
    )}
  </div>
)
