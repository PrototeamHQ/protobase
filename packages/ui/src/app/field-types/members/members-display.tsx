import { cn } from '../../../lib/cn'
import { Skeleton } from '../../../primitives/skeleton'
import type { FieldWidgetProps } from '../field-widget'
import { MemberChip } from './member-chip'
import { memberIdsOf } from './member-ids'
import { text } from './messages'
import { useMembersField } from './use-members-field'

const Members = ({ value, line }: FieldWidgetProps & { line: boolean }) => {
  const members = useMembersField()
  const ids = memberIdsOf(value)
  if (ids.length === 0) return <span className="text-muted-foreground">—</span>
  if (members.needsOrganizations) return <span className="text-muted-foreground">{text('needsOrganizations')}</span>
  if (members.failed) return <span className="text-muted-foreground">{text('couldNotLoadMembers')}</span>
  if (members.isLoading) return <Skeleton className="h-4 w-24" />
  return (
    <span className={cn('flex min-w-0 items-center gap-x-3 gap-y-1', line ? 'overflow-hidden' : 'flex-wrap')}>
      {ids.map((id) => (
        <MemberChip key={id} id={id} name={members.member(id)?.name} />
      ))}
    </span>
  )
}

/** The members a field holds by avatar and name, on record pages, cards and page blocks; one no longer a member as unknown. */
export const MembersDisplay = (props: FieldWidgetProps) => <Members {...props} line={false} />

/** The members a field holds on one line, in a list's table. */
export const MembersCell = (props: FieldWidgetProps) => <Members {...props} line />
