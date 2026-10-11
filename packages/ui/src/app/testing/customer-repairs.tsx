import { useList } from '../../data/use-list'
import { RecordLink } from '../displays/record-link'
import { useLayoutRecord } from '../pages/record-scope'

/**
 * The bike shop's other repairs of a repair's customer for stories, as a project would write it in protobase.ui.tsx:
 * it reads the record the page shows and more through the standard hooks, and links with RecordLink.
 */
export const CustomerRepairs = ({ limit }: { limit: number }) => {
  const around = useLayoutRecord()
  if (!around) throw new Error("CustomerRepairs sits on a repair's page")
  const { record } = around
  const earlier = useList('repairs', { filter: `customer_id = ${String(record.customer_id)} AND id != ${String(record.id)}`, orderBy: 'booked_on desc', pageSize: limit })
  if (earlier.isPending) return <p className="text-[13px] text-muted-foreground">Loading</p>
  if (earlier.items.length === 0) return <p className="text-[13px] text-muted-foreground">No other repairs.</p>
  return (
    <ul aria-label="Earlier repairs" className="divide-y divide-border text-[13px]">
      {earlier.items.map((item) => (
        <li key={String(item.id)} className="flex justify-between gap-4 py-2">
          <RecordLink recordKey={item.id as number} className="font-medium text-primary-text hover:underline">
            {String(item.number)}
          </RecordLink>
          <span className="truncate text-muted-foreground">{String(item.problem)}</span>
        </li>
      ))}
    </ul>
  )
}
