import { useSeries } from '@protobase/ui'

/** Bars for orders per day; the custom component behind `<OrdersPerDay>` in config/overview/page.tsx. */
export const OrdersPerDay = ({ days }: { days: 7 | 30 | 90 }) => {
  const series = useSeries('orders', { field: 'created_at', range: `${days}d`, granularity: 'day' })
  if (series.isPending) return <p className="text-[13px] text-muted-foreground">Loading</p>
  if (series.error) return <p className="text-[13px] text-danger-text">Could not load the orders</p>
  const points = series.data.points
  const highest = Math.max(1, ...points.map((point) => point.count))
  const total = points.reduce((sum, point) => sum + point.count, 0)
  return (
    <figure>
      <div className="flex h-24 items-end gap-0.5" role="img" aria-label={`${total} orders in ${days} days`}>
        {points.map((point) => (
          <div key={point.bucket} title={`${point.bucket.slice(0, 10)}: ${point.count}`} className="flex-1 rounded-t-sm bg-primary/70" style={{ height: `${(point.count / highest) * 100}%` }} />
        ))}
      </div>
      <figcaption className="mt-2 text-xs text-muted-foreground">{total.toLocaleString('en-IE')} orders</figcaption>
    </figure>
  )
}
