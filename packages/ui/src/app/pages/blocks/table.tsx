import { useState } from 'react'
import type { TableProps } from '@protobase/layout'
import type { ResourceModel, ViewModel } from '@protobase/schema'
import { Skeleton } from '../../../primitives/skeleton'
import { ErrorBanner } from '../../error-banner'
import { useAdminMeta } from '../../meta-gate'
import { RecordTable } from '../record-table'
import { useListPage } from '../use-layout-data'
import { propsOf, type BlockProps } from './block-props'
import { CardFrame, Quiet } from './card-frame'

/** The view's list columns, else the first five fields that are not keys or the tenant. */
export const defaultColumns = (model: ResourceModel, view: ViewModel | undefined) =>
  view?.list?.columns ?? Object.keys(model.fields).filter((name) => !model.primaryKey.includes(name) && name !== model.tenant).slice(0, 5)

type LoadedProps = Omit<TableProps, 'resource' | 'actions'> & { model: ResourceModel; view: ViewModel | undefined; actions: BlockProps['slots'][string] }

const LoadedTable = ({ model, view, filter, sort, columns, pageSize = 10, title, description, empty, actions }: LoadedProps) => {
  const shown = (columns ?? defaultColumns(model, view)).filter((name) => Object.hasOwn(model.fields, name))
  const [tokens, setTokens] = useState<string[]>([''])
  const page = useListPage(model, { filter, sort, pageSize, pageToken: tokens.at(-1) })
  const rows = page.data?.items ?? []
  const next = page.data?.nextPageToken
  return (
    <CardFrame title={title} description={description} actions={actions} className="h-full">
      {page.isPending ? (
        <div className="flex flex-col gap-2">{Array.from({ length: 3 }, (_, index) => <Skeleton key={index} className="h-4 w-full" />)}</div>
      ) : page.error ? (
        <ErrorBanner title="Could not load" error={page.error} />
      ) : rows.length === 0 && tokens.length === 1 ? (
        <Quiet>{empty ?? 'Nothing here yet.'}</Quiet>
      ) : (
        <RecordTable
          model={model}
          columns={shown}
          rows={rows}
          label={title ?? model.name}
          pager={{
            page: tokens.length,
            hasPrevious: tokens.length > 1,
            hasNext: Boolean(next),
            busy: page.isFetching,
            previous: () => setTokens((stack) => stack.slice(0, -1)),
            next: () => next && setTokens((stack) => [...stack, next]),
          }}
        />
      )}
    </CardFrame>
  )
}

/** A page of records at a time, in `sort` order; the first column opens the record. */
export const TableBlock = ({ node, slots }: BlockProps) => {
  const props = propsOf<TableProps>(node)
  const { resources, views } = useAdminMeta()
  const model = resources[props.resource]
  if (!model) return null
  return <LoadedTable {...props} model={model} view={views[model.name]} actions={slots.actions} />
}
