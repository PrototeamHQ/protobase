import type { ReactNode } from 'react'
import type { RecordCardProps } from '@protobase/layout'
import type { ResourceModel } from '@protobase/schema'
import { Skeleton } from '../../../primitives/skeleton'
import { ErrorBanner } from '../../error-banner'
import { useAdminMeta } from '../../meta-gate'
import { RecordScope } from '../record-scope'
import { useFirstRecord } from '../use-layout-data'
import { propsOf, type BlockProps } from './block-props'
import { CardFrame, Quiet } from './card-frame'

type LoadedProps = Omit<RecordCardProps, 'resource' | 'actions' | 'children'> & { model: ResourceModel; actions: ReactNode; children: ReactNode[] }

const LoadedRecordCard = ({ model, filter, sort, recordKey, title, description, empty, actions, children }: LoadedProps) => {
  const record = useFirstRecord(model, { filter, sort, key: recordKey })
  const scoped = (content: ReactNode) => (record.data ? <RecordScope value={record.data}>{content}</RecordScope> : undefined)
  const body = record.isPending ? (
    <div className="flex flex-col gap-2">
      <Skeleton className="h-4 w-1/2" />
      <Skeleton className="h-4 w-1/3" />
    </div>
  ) : record.error ? (
    <ErrorBanner title="Could not load" error={record.error} />
  ) : record.data ? (
    scoped(<div className="flex flex-col gap-3">{children}</div>)
  ) : (
    <Quiet>{empty ?? 'Nothing here yet.'}</Quiet>
  )
  return (
    <CardFrame title={title} description={description} actions={actions ? scoped(actions) : undefined} className="h-full">
      {body}
    </CardFrame>
  )
}

/** One record, the one `recordKey` names or the first match: its Fields, Actions and forms inside, actions in the header. */
export const RecordCardBlock = ({ node, children, slots }: BlockProps) => {
  const { resource, filter, sort, recordKey, title, description, empty } = propsOf<RecordCardProps>(node)
  const model = useAdminMeta().resources[resource]
  if (!model) return null
  return (
    <LoadedRecordCard model={model} filter={filter} sort={sort} recordKey={recordKey} title={title} description={description} empty={empty} actions={slots.actions}>
      {children}
    </LoadedRecordCard>
  )
}
