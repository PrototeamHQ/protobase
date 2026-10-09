import type { ReactNode } from 'react'
import type { CardRowProps } from '@protobase/layout'
import type { ResourceModel } from '@protobase/schema'
import { Skeleton } from '../../../primitives/skeleton'
import { ErrorBanner } from '../../error-banner'
import { useAdminMeta } from '../../meta-gate'
import { RecordScope } from '../record-scope'
import { scopeOf, useListPage } from '../use-layout-data'
import { propsOf, type BlockProps } from './block-props'
import { CardFrame, Quiet } from './card-frame'

type LoadedProps = Omit<CardRowProps, 'resource' | 'actions' | 'children'> & { model: ResourceModel; actions: ReactNode; children: ReactNode[] }

const LoadedCardRow = ({ model, filter, sort, limit = 12, title, description, empty, actions, children }: LoadedProps) => {
  const page = useListPage(model, { filter, sort, pageSize: limit })
  const rows = page.data?.items ?? []
  return (
    <CardFrame title={title} description={description} actions={actions}>
      {page.isPending ? (
        <div className="flex gap-3">{Array.from({ length: 3 }, (_, index) => <Skeleton key={index} className="h-24 w-56" />)}</div>
      ) : page.error ? (
        <ErrorBanner title="Could not load" error={page.error} />
      ) : rows.length === 0 ? (
        <Quiet>{empty ?? 'Nothing here yet.'}</Quiet>
      ) : (
        <ul className="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-1">
          {rows.map((row) => {
            const scope = scopeOf(model, row)
            return (
              <li key={scope.key} className="flex w-60 shrink-0 snap-start flex-col gap-2 rounded-lg border border-border bg-surface p-3">
                <RecordScope value={scope}>{children}</RecordScope>
              </li>
            )
          })}
        </ul>
      )}
    </CardFrame>
  )
}

/** Up to `limit` records side by side, each a small card made from the children, with their own actions. */
export const CardRowBlock = ({ node, children, slots }: BlockProps) => {
  const { resource, ...props } = propsOf<CardRowProps>(node)
  const model = useAdminMeta().resources[resource]
  if (!model) return null
  return (
    <LoadedCardRow {...props} model={model} actions={slots.actions}>
      {children}
    </LoadedCardRow>
  )
}
