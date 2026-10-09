import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { createWhere, printFilter, type RelatedModel, type ResourceModel } from '@protobase/schema'
import { useClient } from '../data/api-provider'
import { keys } from '../data/query-keys'
import { Skeleton } from '../primitives/skeleton'
import { Section } from '../record-view'
import { ErrorBanner } from './error-banner'
import { useAdminMeta } from './meta-gate'
import { defaultColumns } from './pages/blocks/table'
import { RecordTable } from './pages/record-table'

const where = createWhere()

/** The most join records a section reads to find its records; the list API's largest page. */
const maxThrough = 500

const and = (...parts: Array<string | undefined>) => parts.filter((part): part is string => Boolean(part)).map((part) => `(${part})`).join(' AND ')

/**
 * The filter on the section's resource: its `field` is this record's key, or, through a join resource, one of the keys
 * the join records that point at this record hold. `null` when no join record does, so nothing can match.
 */
const useMatch = (item: RelatedModel, recordKey: string) => {
  const client = useClient()
  const { resources } = useAdminMeta()
  const through = item.through
  const via = through ? resources[through.resource] : undefined
  const key = through?.key ?? via?.primaryKey[0]
  const viaFilter = through ? and(printFilter(where.eq(through.field, recordKey)), through.filter) : ''
  const collected = useQuery({
    queryKey: keys.list(via?.name ?? '', viaFilter, '', maxThrough, `related:${key}`),
    enabled: Boolean(via && key),
    queryFn: async () => {
      const page = await client.search(via!.name, { filter: viaFilter, fields: [key!], pageSize: maxThrough })
      return [...new Set(page.items.flatMap((row) => (row[key!] === null || row[key!] === undefined ? [] : [String(row[key!])])))]
    },
  })
  if (!through) return { filter: and(printFilter(where.eq(item.field, recordKey)), item.filter), isPending: false, error: null }
  if (!collected.data) return { filter: undefined, isPending: collected.isPending, error: collected.error }
  const filter = collected.data.length === 0 ? null : and(printFilter(where.in(item.field, collected.data)), item.filter)
  return { filter, isPending: false, error: null }
}

const RelatedRows = ({ item, model, filter }: { item: RelatedModel; model: ResourceModel; filter: string }) => {
  const client = useClient()
  const { views } = useAdminMeta()
  const [tokens, setTokens] = useState<string[]>([''])
  const pageSize = item.pageSize ?? 10
  const sort = item.sort ?? ''
  const token = tokens.at(-1) ?? ''
  // A filter through a join resource may hold hundreds of keys, so the list is asked for with a JSON body
  const page = useQuery({
    queryKey: keys.list(model.name, filter, sort, pageSize, token),
    placeholderData: keepPreviousData,
    queryFn: () => client.search(model.name, { filter, orderBy: sort || undefined, pageSize, pageToken: token || undefined }),
  })
  if (page.isPending) return <Loading />
  if (page.error) return <ErrorBanner title="Could not load" error={page.error} />
  const rows = page.data.items
  if (rows.length === 0 && tokens.length === 1) return <Empty text={item.empty} />
  const columns = (item.columns ?? defaultColumns(model, views[model.name]).filter((name) => name !== item.field)).filter((name) => name.includes('.') || Object.hasOwn(model.fields, name))
  const next = page.data.nextPageToken
  return (
    <RecordTable
      model={model}
      columns={columns}
      rows={rows}
      label={item.title}
      pager={{
        page: tokens.length,
        hasPrevious: tokens.length > 1,
        hasNext: Boolean(next),
        busy: page.isFetching,
        previous: () => setTokens((stack) => stack.slice(0, -1)),
        next: () => next && setTokens((stack) => [...stack, next]),
      }}
    />
  )
}

const Loading = () => <div className="flex flex-col gap-2">{Array.from({ length: 3 }, (_, index) => <Skeleton key={index} className="h-4 w-full" />)}</div>

const Empty = ({ text }: { text: string | undefined }) => <p className="text-[13px] text-muted-foreground">{text ?? 'Nothing here yet.'}</p>

/** A record page section listing the records of another resource that point at this record, directly or through a join resource. */
export const RelatedSection = ({ item, recordKey }: { item: RelatedModel; recordKey: string }) => {
  const { resources } = useAdminMeta()
  const model = resources[item.resource]
  const match = useMatch(item, recordKey)
  if (!model) return null
  return (
    <Section title={item.title} help={item.help}>
      {match.isPending ? (
        <Loading />
      ) : match.error ? (
        <ErrorBanner title="Could not load" error={match.error} />
      ) : match.filter === null || match.filter === undefined ? (
        <Empty text={item.empty} />
      ) : (
        <RelatedRows key={match.filter} item={item} model={model} filter={match.filter} />
      )}
    </Section>
  )
}
