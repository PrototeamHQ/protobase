import { formatDate } from '../format/date'
import { formatInt } from '../format/number'

export type ActivityTooltipProps = { active?: boolean; payload?: Array<{ payload: { at: number; count: number } }>; noun: string }

export const ActivityTooltip = ({ active, payload, noun }: ActivityTooltipProps) => {
  const point = payload?.[0]?.payload
  if (!active || !point) return null
  return (
    <div className="rounded-md border bg-background px-2.5 py-1.5 text-xs shadow-pop">
      <div className="text-muted-foreground">{formatDate(point.at)}</div>
      <div className="font-semibold tabular-nums">
        {formatInt(point.count)} {noun}
      </div>
    </div>
  )
}
