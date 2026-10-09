import { defineUi, useSeries, type ActionContext } from '@protobase/ui'

/** Bars for orders per day; the custom component behind `<OrdersPerDay>` in config/overview/page.tsx. */
const OrdersPerDay = ({ days }: { days: 7 | 30 | 90 }) => {
  const series = useSeries('orders', { field: 'createdAt', range: `${days}d`, granularity: 'day' })
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

/** "Send reminder" on an invoice: opens a mail to the customer, and marks a draft invoice as sent. */
const send = async ({ record, recordKey, etag, client }: ActionContext) => {
  const company = await client.get('companies', String(record!.companyId))
  const subject = encodeURIComponent(`Invoice ${String(record!.number)}`)
  window.location.assign(`mailto:${String(company.record.email ?? '')}?subject=${subject}`)
  if (record!.status === 'draft') await client.update('invoices', recordKey!, { status: 'sent' }, etag ?? '*')
}

export default defineUi({ components: { OrdersPerDay }, actions: { send } })
