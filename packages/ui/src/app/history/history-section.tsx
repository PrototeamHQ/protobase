import type { HistoryChange } from '@protobase/client'
import type { HistorySectionModel, ResourceModel, ViewModel } from '@protobase/schema'
import { formatDateTime, formatRelativeTime } from '../../format/date'
import { Button } from '../../primitives/button'
import { Skeleton } from '../../primitives/skeleton'
import { Section } from '../../record-view'
import { ErrorBanner } from '../error-banner'
import { describeChange } from './describe-change'
import { useRecordHistory } from './use-record-history'

const Loading = () => <div className="flex flex-col gap-2">{Array.from({ length: 3 }, (_, index) => <Skeleton key={index} className="h-4 w-full" />)}</div>

const Change = ({ change, model, view }: { change: HistoryChange; model: ResourceModel; view?: ViewModel }) => {
  const { who, verb, fields } = describeChange(change, model, view)
  const at = Date.parse(change.at)
  return (
    <li className="flex flex-col gap-1.5 py-3 first:pt-0 last:pb-0">
      <p>
        <span className="font-medium text-foreground">{who}</span> <span className="text-muted-foreground">{verb}</span>{' '}
        <time dateTime={change.at} title={formatDateTime(at)} className="text-muted-foreground">
          · {formatRelativeTime(Math.max(0, Math.round((Date.now() - at) / 1000)))}
        </time>
      </p>
      {fields.length > 0 && (
        <dl className="grid grid-cols-[minmax(0,auto)_minmax(0,1fr)] gap-x-4 gap-y-1">
          {fields.map((field) => (
            <div key={field.name} className="contents">
              <dt className="text-muted-foreground">{field.label}</dt>
              <dd className="min-w-0 break-words">
                {field.before === undefined ? (
                  <span className="text-muted-foreground">changed</span>
                ) : (
                  <>
                    <del className="text-muted-foreground">{field.before}</del> → <ins className="no-underline">{field.after}</ins>
                  </>
                )}
              </dd>
            </div>
          ))}
        </dl>
      )}
    </li>
  )
}

/** The record's changes, newest first, with who made each and the fields before and after; Show more pages further back. */
export const HistorySection = ({ item, model, view, recordKey, etag }: { item: HistorySectionModel; model: ResourceModel; view?: ViewModel; recordKey: string; etag: string }) => {
  const history = useRecordHistory(model.name, recordKey, item.limit ?? 10, etag)
  return (
    <Section title={item.title}>
      {history.isPending ? (
        <Loading />
      ) : history.error ? (
        <ErrorBanner title="Could not load the history" error={history.error} />
      ) : history.items.length === 0 ? (
        <p className="text-muted-foreground">No changes kept yet.</p>
      ) : (
        <>
          <ol className="divide-y divide-border">
            {history.items.map((change) => <Change key={change.id} change={change} model={model} view={view} />)}
          </ol>
          {history.hasNextPage && (
            <Button size="sm" className="mt-4" disabled={history.isFetchingNextPage} onClick={() => void history.fetchNextPage()}>
              Show more
            </Button>
          )}
        </>
      )}
    </Section>
  )
}
