import { enumLabel } from '@protobase/schema'
import type { RecordCardProps } from '../displays/list-displays'

/**
 * The bike shop's repair card for stories, as a project or plugin would write it: the bike and its number, the
 * customer, and the status with what the repair is estimated at.
 */
export const RepairCard = ({ row }: RecordCardProps) => (
  <span aria-label={`Repair ${String(row.record.number)}`} className="flex flex-col gap-1">
    <span className="flex items-baseline justify-between gap-2">
      <span className="truncate font-medium">{String(row.record.bike)}</span>
      <span className="font-mono text-xs text-muted-foreground">{String(row.record.number)}</span>
    </span>
    <span className="truncate text-muted-foreground">{row.labels.customer_id ?? String(row.record.customer_id)}</span>
    <span className="mt-1 flex items-center justify-between text-xs">
      <span className="rounded-md bg-primary-soft px-1.5 py-0.5 text-primary-text">{enumLabel(String(row.record.status))}</span>
      <span className="tabular-nums">€{String(row.record.estimate)}</span>
    </span>
  </span>
)

/** A card that throws while drawing, for the stories of its fallback. */
export const BrokenCard = (): never => {
  throw new Error('BrokenCard broke')
}
