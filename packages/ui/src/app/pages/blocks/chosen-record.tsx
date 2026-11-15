import type { ReactNode } from 'react'
import type { ResourceModel } from '@protobase/schema'
import { Skeleton } from '../../../primitives/skeleton'
import { ErrorBanner } from '../../error-banner'
import { RecordScope } from '../record-scope'
import { useFirstRecord } from '../use-layout-data'
import { Quiet } from './card-frame'
import { text } from '../messages'

/** Which record a `select` chose: by its key as text, or the first that matches a filter in a sort's order. */
export type ChosenQuery = { key: string } | { filter: string; sort: string }

/** The record a block's `select` chose, with its children drawn inside it, under a rule. */
export const ChosenRecord = ({ model, query, children }: { model: ResourceModel; query: ChosenQuery; children: ReactNode[] }) => {
  const record = useFirstRecord(model, query)
  const body = record.isPending ? (
    <div className="flex flex-col gap-2">
      <Skeleton className="h-4 w-1/2" />
      <Skeleton className="h-4 w-1/3" />
    </div>
  ) : record.error ? (
    <ErrorBanner title={text('couldNotLoad')} error={record.error} />
  ) : record.data ? (
    <RecordScope value={record.data}>
      <div className="flex flex-col gap-3">{children}</div>
    </RecordScope>
  ) : (
    <Quiet>{text('nothingYet')}</Quiet>
  )
  return <div className="mt-4 border-t pt-4">{body}</div>
}
