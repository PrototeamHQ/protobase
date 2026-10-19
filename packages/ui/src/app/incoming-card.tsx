import { ChevronRight } from 'lucide-react'
import type { LayoutItemModel, ResourceModel } from '@protobase/schema'
import { formatInt } from '../format/number'
import { Skeleton } from '../primitives/skeleton'
import { SidebarCard } from '../record-view'
import { incomingAddress, incomingRelations } from './incoming-relations'
import { useAdminMeta } from './meta-gate'
import { AppLink } from './use-app-address'
import { useIncomingCounts } from './use-incoming-counts'
import { text } from './record-messages'

type IncomingCardProps = { model: ResourceModel; recordKey: string; layout: LayoutItemModel[]; lines?: ResourceModel }

/** The rail's card of the records pointing at this one: per resource and field, how many, linking to them in their list. */
export const IncomingCard = ({ model, recordKey, layout, lines }: IncomingCardProps) => {
  const { resources, views } = useAdminMeta()
  const counts = useIncomingCounts(incomingRelations(model, resources, views, layout, lines), resources, recordKey)
  if (counts.length === 0) return null
  return (
    <SidebarCard title={text('relatedRecords')}>
      <ul className="-mx-2">
        {counts.map(({ relation, count }) => (
          <li key={`${relation.resource}.${relation.field}`}>
            <AppLink to={incomingAddress(relation, recordKey)} className="group flex items-center justify-between gap-3 rounded-md px-2 py-2 hover:bg-muted">
              <span className="min-w-0 truncate font-medium text-primary-text">{relation.label}</span>
              <span className="flex shrink-0 items-center gap-1 tabular-nums text-muted-foreground">
                {count === undefined ? <Skeleton className="h-4 w-6" /> : `${formatInt(count.count)}${count.exact ? '' : '+'}`}
                <ChevronRight className="size-4 text-faint-foreground group-hover:text-foreground" />
              </span>
            </AppLink>
          </li>
        ))}
      </ul>
    </SidebarCard>
  )
}
